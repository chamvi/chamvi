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
import { createCodeTools } from './code-tools.ts';
import { assembleTools, createToolContext, toRunError } from './helpers.ts';
import type { CodeToolStep, ExecuteContext } from './types.ts';

/** The synthetic tool call a code run's `run()` executes in: part of its approval and wait ids (`0:run:<n>`). */
const CODE_RUN_TOOL_CALL_ID = 'run';

/**
 * `value` as plain JSON (undefined stays undefined), so every store keeps
 * the same output; undefined when it is no JSON value (a function, a
 * symbol, a BigInt, a cycle).
 */
function toJsonOutput(value: unknown): { value: unknown } | undefined {
    if (value === undefined) {
        return { value };
    }

    try {
        const json = JSON.stringify(value, (_key, item: unknown) => {
            if (typeof item === 'function' || typeof item === 'symbol') {
                throw new TypeError('not JSON');
            }

            return item;
        });

        return json === undefined ? undefined : { value: JSON.parse(json) };
    } catch {
        return undefined;
    }
}

/**
 * One execution of a claimed, `running` run of a code agent: runs
 * `run(payload, ctx)` inside one synthetic tool-call frame (`toolCallId`
 * `run`, `toolName` the agent, step index 0), so dispatch(),
 * waitForDispatch(), approve() and ctx.channels work as inside a tool
 * call. `ctx.tools` holds the agent's tools wrapped as for a model run
 * (createCodeTools). Each execution re-runs `run()` from the start; its
 * effect-recorded calls return their records. A suspension pauses the run, whatever `run()`
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
    const frame: ToolCallFrame = {
        runId: run.id,
        toolCallId: CODE_RUN_TOOL_CALL_ID,
        toolName: agent.name,
        stepIndex: 0,
        approvals: 0,
        effects: store.effects,
        artifacts: toolContext.artifacts,
    };
    // one write at a time, so concurrent ctx.tools calls get distinct step indexes
    let steps: Promise<void> = Promise.resolve();
    const appendStep = (step: CodeToolStep): Promise<void> => {
        const write = steps.then(async () => {
            // work run() left behind after its execution ended writes nothing more
            if (local.signal.aborted || (ctx.ownsRun && !await ctx.ownsRun())) {
                return;
            }

            const stored: Step = {
                runId: run.id,
                index: (await store.steps.find(run.id)).length,
                kind: 'tool',
                ...step,
            };

            await store.steps.insert(stored);
            ctx.onStepAppended(stored);
        });

        steps = write.catch(() => {});

        return write;
    };
    const startedAt = clock.now();
    const inflight = new Set<Promise<unknown>>();
    let fatal: { error: unknown } | undefined;
    let outcome: { output: unknown } | { error: unknown };

    try {
        // the same ToolContext the tools get, so the provided values bound to it stay reachable through inject()
        const assembling = assembleTools(ctx, runContext, (request) => {
            // a suspension inside a tool pauses the run like a direct approve()
            frame.suspended ??= request;
        }, undefined, toolContext);

        // bounded by the run signal like run() itself; never leak its rejection
        assembling.catch(() => {});

        const assembled = await untilAborted(assembling, signal);
        const codeContext: CodeRunContext = Object.assign(toolContext, {
            tools: createCodeTools({
                agent: agent.name,
                tools: assembled.tools,
                activeTools: assembled.activeTools,
                toolsContext: assembled.toolsContext,
                frame,
                signal,
                onStep: appendStep,
                now: () => clock.now(),
                inflight,
                onFatal: (error) => {
                    fatal ??= { error };
                },
            }),
        });
        const work = runToolCall(frame, async () => body(run.trigger.payload, codeContext));

        // run() may keep going after an abort; never leak its rejection
        work.catch(() => {});
        outcome = { output: await untilAborted(work, signal) };
        assertTrust(runContext);
    } catch (error) {
        outcome = { error };
    }

    // the ctx.tools calls run() left running finish first, as a model step waits for all its calls,
    // so a pause or settle never leaves an effect running that the next execution would apply again
    while (inflight.size > 0 && !signal.aborted) {
        await untilAborted(Promise.allSettled([...inflight]), signal).catch(() => {});
    }

    frame.abandoned = true;
    local.abort();
    timeout?.clear();

    const usage = { ...run.usage };

    // a FatalToolError fails the run whatever run() did with it, before a pause (as in a model run)
    if (fatal && !ctx.signal.aborted && !timeout?.signal.aborted) {
        outcome = { error: fatal.error };
    } else if (frame.suspended) {
        // run() may have caught the SuspendSignal and returned (or thrown) anyway
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

    if ('output' in outcome) {
        const json = toJsonOutput(outcome.output);

        outcome = json ? { output: json.value } : { error: new ValidationError(`The output of code agent "${agent.name}" is not JSON-serialisable.`) };
    }

    // after the steps of the ctx.tools calls; a run another owner took over gets no step from this execution
    await steps;

    if (!ctx.ownsRun || await ctx.ownsRun()) {
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
