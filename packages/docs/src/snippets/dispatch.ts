import { Output } from 'ai';
import type { LanguageModel } from 'ai';
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

// #region tool
const dispatchPr = defineTool({
    description: 'Starts a run of its own for one pull request that needs work.',
    inputSchema: z.object({ pr: z.string().describe('owner/repo#number') }),
    execute: async ({ pr }, { context }) => {
        // the day the daily run was fired, not the wall clock: a redo keeps the key
        const day = context.run.trigger.receivedAt.toISOString().slice(0, 10);

        return dispatch(context, {
            payload: { pr },
            idempotencyKey: `${pr}@${day}`,
            address: pr,
        });
    },
});
// #endregion tool

// #region agent
const maintainer = defineAgent({
    name: 'maintainer',
    model,
    instructions: 'Every morning, dispatch each pull request that needs work.',
    channels: [
        cron.on('0 6 * * *'),
        // the opt-in: runs of this agent may start runs of this agent (role 'default')
        agent.on({
            schema: z.object({ pr: z.string() }),
            concurrencyKey: (p) => p.pr,
            maxPerRun: 20,
        }),
    ],
    tools: { dispatch_pr: dispatchPr },
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
