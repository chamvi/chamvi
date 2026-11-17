import type { Agent, EngineOptions, IEngine } from '@chamvi/core';

/** Builds the app's engine on the repositories every replica shares (see Database store). */
type CreateEngine = (options: Pick<EngineOptions, 'agents' | 'channels' | 'onError'>) => IEngine;

export async function serve(createEngine: CreateEngine, agents: Agent[]) {
    // #region shutdown
    // your engine on the repositories every replica shares (see Database store)
    const engine = createEngine({
        agents,
        onError: (error, run) => console.error('[agents]', run?.id, error),
    });

    await engine.start();

    process.once('SIGTERM', () => {
        // wait up to 25 s for in-flight runs, then mark the rest interrupted
        engine.drain({ timeoutMs: 25_000 })
            .then(() => process.exit(0))
            .catch(() => process.exit(1));
    });
    // #endregion shutdown

    return engine;
}

export async function cancelRun(engine: IEngine, runId: string) {
    // #region cancel
    await engine.cancel(runId);

    const run = await engine.getRun(runId);

    // RunStatus.CANCELLED, or still RunStatus.RUNNING with cancelRequested when another replica executes it
    console.log(run?.status, run?.cancelRequested);
    // #endregion cancel
}
