import { Output } from 'ai';
import type { LanguageModel, Tool } from 'ai';
import { z } from 'zod';
import {
    Engine,
    agent,
    agentChannel,
    createMemoryStore,
    defineEffectTool,
    defineModelAgent,
    defineSimpleAgent,
    defineTool,
    dispatch,
    dispatchTo,
    dispatchTools,
    waitForDispatch,
} from '@chamvi/core';
import { cron, cronChannel } from '@chamvi/channel-cron';

declare const model: LanguageModel;
// stand-ins for real tools (e.g. github_list_pull_requests from @chamvi/github)
declare const listPullRequests: Tool;
declare const reviewPullRequest: Tool;
// a stand-in for a GitHub client call
declare function fetchOpenPullRequests(label: string): Promise<{ pr: string; sha: string }[]>;

// #region agent
// One agent, two kinds of run: the daily run lists and dispatches, each
// dispatched run works on one pull request with its own context, budget and
// approvals, in parallel with the others.
const maintainer = defineModelAgent({
    name: 'maintainer',
    model,
    instructions: [
        'On the daily schedule: list the open pull requests and call dispatch_pr for each one that needs work.',
        'When started with a { pr, sha } payload: review that pull request only.',
    ].join('\n'),
    channels: [
        cron.on('0 6 * * *'),
        // the opt-in: runs of this agent (and of the sweeper) may start runs of this agent under the role 'pr'
        agent.on({
            role: 'pr',
            schema: z.object({
                pr: z.string().describe('owner/repo#number'),
                sha: z.string().describe('the head commit'),
            }),
            description: 'Starts a run of its own for one pull request that needs work.',
            from: ['sweeper'],
            // one review per pushed commit, whichever run dispatched it
            idempotencyKey: (p) => `${p.pr}@${p.sha}`,
            // never two runs on one pull request at a time
            concurrencyKey: (p) => p.pr,
            // the child's address: its tools reply on that pull request
            address: (p) => p.pr,
            maxPerRun: 20,
        }),
    ],
    tools: {
        list_pull_requests: listPullRequests,
        // dispatch_pr: input { pr, sha } from the role's schema, bound to the role per execution
        ...dispatchTools({ roles: ['pr'] }),
        review_pull_request: reviewPullRequest,
    },
});
// #endregion agent

// #region simple
// No model: run() lists, dispatches one child per pull request and waits.
const sweeper = defineSimpleAgent({
    name: 'sweeper',
    description: 'Reviews every open pull request labelled "ready" in a run of its own.',
    channels: [cron.on('0 7 * * *')],
    tools: {
        // an effect tool records its result: the execution after the wait gets the same list back
        list_ready: defineEffectTool({
            description: 'Lists the open pull requests labelled "ready".',
            inputSchema: z.object({}),
            execute: async () => fetchOpenPullRequests('ready'),
        }),
    },
    run: async (_payload, ctx) => {
        // ctx.tools holds the agent's tools by name (`!`: an index read under noUncheckedIndexedAccess)
        const prs = await ctx.tools.list_ready!({}) as { pr: string; sha: string }[];
        // effect-recorded: the execution after the wait gets the same children back
        const children = await Promise.all(prs.map((p) => dispatchTo(ctx, {
            agent: 'maintainer',
            role: 'pr',
            payload: p,
        })));
        // pauses the run (no claim, no slot) until every review settled
        const outcomes = await waitForDispatch(ctx, children);

        // the run's output
        return outcomes.map(({ runId, status }) => ({ runId, status }));
    },
});
// #endregion simple

// #region fan-out
const audit = defineTool({
    description: 'Hunts every area in a run of its own, then has the reporter draft the report.',
    inputSchema: z.object({ areas: z.array(z.string()).min(1) }),
    execute: async ({ areas }, { context }) => {
        // effect-recorded: the call runs again on resume and gets the same runs back
        const hunts = await Promise.all(areas.map((area) => dispatch(context, {
            role: 'hunt',
            payload: { area },
        })));

        // pauses the run until every hunt settled, then returns one outcome per hunt, in order
        const findings = await waitForDispatch(context, hunts);

        // a run of another agent, whose 'draft' role lists 'auditor' in from
        const draft = await dispatchTo(context, {
            agent: 'reporter',
            role: 'draft',
            payload: { findings },
        });
        const report = await waitForDispatch(context, draft, { timeoutMs: 60 * 60 * 1000 });

        return report.status === 'completed' ? report.output : { failed: report.error };
    },
});

const auditor = defineModelAgent({
    name: 'auditor',
    model,
    instructions: 'Every Monday, audit the repository area by area.',
    channels: [
        cron.on('0 3 * * 1'),
        agent.on({
            role: 'hunt',
            schema: z.object({ area: z.string() }),
            maxPerRun: 10,
        }),
    ],
    // no new dispatch once the whole tree used two million tokens
    budget: { maxSubtreeTokens: 2_000_000 },
    tools: { audit },
});

const reporter = defineModelAgent({
    name: 'reporter',
    model,
    instructions: 'Draft an audit report from the findings in the payload.',
    channels: [agent.on({ role: 'draft', from: ['auditor'] })],
    output: Output.object({ schema: z.object({ summary: z.string(), findings: z.array(z.string()) }) }),
});
// #endregion fan-out

// #region engine
export const engine = new Engine({
    store: createMemoryStore(),
    agents: [maintainer, sweeper, auditor, reporter],
    // a bare engine lists the agent channel; @chamvi/app contributes it
    channels: [cronChannel(), agentChannel()],
});
// #endregion engine
