import { Output } from 'ai';
import type { LanguageModel, Tool } from 'ai';
import { z } from 'zod';
import {
    Engine,
    agent,
    agentChannel,
    createMemoryStore,
    defineAgent,
    defineTool,
    dispatch,
    dispatchTo,
    waitForDispatch,
} from '@chamvi/core';
import { cron, cronChannel } from '@chamvi/channel-cron';

declare const model: LanguageModel;
// stand-ins for real tools (e.g. github_list_pull_requests from @chamvi/github)
declare const listPullRequests: Tool;
declare const reviewPullRequest: Tool;

// #region tool
// The adapter between the model and the engine: dispatch() does the work
// (schema, effect record, dedupe, limits, lineage, queueing); the tool only
// decides the child's idempotency key and address.
const dispatchPr = defineTool({
    description: 'Starts a run of its own for one pull request that needs work.',
    inputSchema: z.object({ pr: z.string().describe('owner/repo#number') }),
    execute: async ({ pr }, { context }) => {
        // the day the daily run was fired, not the wall clock: a redo keeps the key
        const day = context.run.trigger.receivedAt.toISOString().slice(0, 10);

        // resolves at once with { runId, deduplicated }: fire and forget
        return dispatch(context, {
            role: 'pr',
            payload: { pr },
            idempotencyKey: `${pr}@${day}`,
            address: pr,
        });
    },
});
// #endregion tool

// #region agent
// One agent, two kinds of run: the daily run lists and dispatches, each
// dispatched run works on one pull request with its own context, budget and
// approvals, in parallel with the others.
const maintainer = defineAgent({
    name: 'maintainer',
    model,
    instructions: [
        'On the daily schedule: list the open pull requests and call dispatch_pr for each one that needs work.',
        'When started with a { pr } payload: review that pull request only.',
    ].join('\n'),
    channels: [
        cron.on('0 6 * * *'),
        // the opt-in: runs of this agent may start runs of this agent under the role 'pr'
        agent.on({
            role: 'pr',
            schema: z.object({ pr: z.string() }),
            // never two runs on one pull request at a time
            concurrencyKey: (p) => p.pr,
            maxPerRun: 20,
        }),
    ],
    tools: {
        list_pull_requests: listPullRequests,
        dispatch_pr: dispatchPr,
        review_pull_request: reviewPullRequest,
    },
});
// #endregion agent

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

const auditor = defineAgent({
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

const reporter = defineAgent({
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
    agents: [maintainer, auditor, reporter],
    // a bare engine lists the agent channel; @chamvi/app contributes it
    channels: [cronChannel(), agentChannel()],
});
// #endregion engine
