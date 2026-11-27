import { ErrorCode } from '@chamvi/errors';
import { LeaseLostError } from '@chamvi/core';
import { RunStatus } from '@chamvi/store';
import type { Agent, EngineOptions, IEngine } from '@chamvi/core';

/** Builds the app's engine on the repositories every replica shares (see Database store). */
type CreateEngine = (options: Pick<EngineOptions, 'agents' | 'channels' | 'onError'>) => IEngine;

declare const logger: { error(fields: object, message: string): void };

export function createReportingEngine(createEngine: CreateEngine, agents: Agent[]) {
    // #region on-error
    // your engine on the repositories every replica shares (see Database store)
    const engine = createEngine({
        agents,
        onError: (error, run) => {
            if (error instanceof LeaseLostError) {
                // another replica carries the run on; nothing to do
                return;
            }

            logger.error({ err: error, runId: run?.id }, 'chamvi');
        },
    });
    // #endregion on-error

    return engine;
}

export async function explainFailure(engine: IEngine, runId: string) {
    // #region run-error
    const run = await engine.getRun(runId);

    if (run?.status === RunStatus.FAILED) {
        switch (run.error?.code) {
            case ErrorCode.BUDGET_EXCEEDED:
                return 'Raise maxSteps or maxTokens, or narrow the instructions.';
            case ErrorCode.TIMEOUT:
                return 'Raise timeoutMs or make the tools faster.';
            case ErrorCode.FATAL_TOOL:
                return `A tool stopped the run: ${run.error.message}`;
            default:
                return run.error?.message;
        }
    }

    // #endregion run-error
    return undefined;
}
