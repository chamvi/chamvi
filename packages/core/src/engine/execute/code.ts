/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { CodeRunContext } from '../../agent/types.ts';
import { bindRunSnapshot } from '../../dispatch/helpers.ts';
import { runToolCall } from '../../effect/frame.ts';
import type { ToolCallFrame } from '../../effect/types.ts';
import { InvalidAgentDefinitionError, ValidationError } from '../../errors/index.ts';
import { RunStatus } from '../../run/constants.ts';
import { untilAborted } from '../../run/helpers.ts';
import type { RunContext, Step } from '../../run/types.ts';
import { assertTrust, bindTrust } from '../../trust/module.ts';
import { resolveBudget, timeoutSignal } from '../budget.ts';
import { createToolContext, toRunError } from './helpers.ts';
import type { ExecuteContext } from './types.ts';

/** The synthetic tool call a code run's `run()` executes in: part of its approval and wait ids (`0:run:<n>`). */
const CODE_RUN_TOOL_CALL_ID = 'run';

/** Whether `value` can be stored as a run's output (JSON). */
function isSerialisable(value: unknown): boolean {
    try {
        JSON.stringify(value);

        return true;
    } catch {
        return false;
    }
}

/**
 * One execution of a claimed, `running` run of a code agent: runs
 * `run(payload, ctx)` inside one synthetic tool-call frame (`toolCallId`
 * `run`, `toolName` the agent, step index 0), so dispatch(),
 * waitForDispatch(), approve() and ctx.channels work as inside a tool
 * call. Each execution re-runs `run()` from the start; its effect-recorded
 * calls return their records. A suspension pauses the run, whatever `run()`
 * did with the signal afterwards; else the returned value completes it (one
 * `tool` step) and a throw fails it. No model call, no `llm` step, no
 * checkpoint.
 */
export async function executeCodeRun(ctx: ExecuteContext): Promise<void> {
    const {
        run,
        agent,
        store,
        clock,
    } = ctx;
    const { run: body } = agent.definition;

    if (typeof body !== 'function') {
        throw new InvalidAgentDefinitionError(`Agent "${agent.name}" is not a code agent.`);
    }

    const budget = resolveBudget(agent);
    const timeout = budget.timeoutMs === undefined ? undefined : timeoutSignal(clock, budget.timeoutMs);
    // aborted on every exit, so work run() left behind sees the end of its execution
    const local = new AbortController();
    const signal = AbortSignal.any([ctx.signal, local.signal, ...(timeout ? [timeout.signal] : [])]);
    const runContext: RunContext = {
        runId: run.id,
        agent: run.agent,
        trigger: run.trigger,
        signal,
    };

    bindTrust(runContext, {
        taint: run.taint,
        policy: agent.definition.trust,
        now: () => clock.now(),
        persist: (taint) => ctx.update({ taint }),
        engine: ctx.engine,
    });

    bindRunSnapshot(runContext);

    const toolContext = createToolContext(ctx, runContext);
    // the same object, so the provided values bound to it stay reachable through inject()
    const codeContext: CodeRunContext = Object.assign(toolContext, { tools: {} });
    const frame: ToolCallFrame = {
        runId: run.id,
        toolCallId: CODE_RUN_TOOL_CALL_ID,
        toolName: agent.name,
        stepIndex: 0,
        approvals: 0,
        effects: store.effects,
        artifacts: toolContext.artifacts,
    };
    const startedAt = clock.now();
    let outcome: { output: unknown } | { error: unknown };

    try {
        const work = runToolCall(frame, async () => body(run.trigger.payload, codeContext));

        // run() may keep going after an abort; never leak its rejection
        work.catch(() => {});
        outcome = { output: await untilAborted(work, signal) };
        assertTrust(runContext);
    } catch (error) {
        outcome = { error };
    } finally {
        local.abort();
        timeout?.clear();
    }

    const usage = { ...run.usage };

    // first: run() may have caught the SuspendSignal and returned (or thrown) anyway
    if (frame.suspended) {
        await ctx.pause(frame.suspended, usage);

        return;
    }

    if (ctx.signal.aborted) {
        await ctx.finish({ status: RunStatus.CANCELLED });

        return;
    }

    if (timeout?.signal.aborted) {
        await ctx.finish({ status: RunStatus.FAILED, error: toRunError(timeout.signal.reason) });

        return;
    }

    if ('output' in outcome && !isSerialisable(outcome.output)) {
        outcome = { error: new ValidationError(`The output of code agent "${agent.name}" is not JSON-serialisable.`) };
    }

    const step: Step = {
        runId: run.id,
        index: (await store.steps.find(run.id)).length,
        kind: 'tool',
        name: agent.name,
        input: run.trigger.payload,
        ...('error' in outcome ? { error: toRunError(outcome.error) } : { output: outcome.output }),
        startedAt,
        finishedAt: clock.now(),
    };

    // a run another owner took over gets no step from this execution
    if (!ctx.ownsRun || await ctx.ownsRun()) {
        await store.steps.insert(step);
        ctx.onStepAppended(step);
    }

    if ('error' in outcome) {
        await ctx.finish({ status: RunStatus.FAILED, error: toRunError(outcome.error) });

        return;
    }

    await ctx.finish({
        status: RunStatus.COMPLETED,
        ...(outcome.output !== undefined ? { output: outcome.output } : {}),
    });
}
