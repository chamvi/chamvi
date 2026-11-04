import type { LanguageModel } from 'ai';
import {
    Engine,
    consoleChannel,
    createMemoryStore,
    defineModelAgent,
} from '@chamvi/core';

export function createEngine(model: LanguageModel) {
    // #region many
    const triage = defineModelAgent({
        name: 'triage',
        model,
        instructions: 'Triage the issue.',
    });
    const digest = defineModelAgent({
        name: 'digest',
        model,
        instructions: 'Summarize the day.',
    });

    const engine = new Engine({
        store: createMemoryStore(),
        agents: [triage, digest],
        // tools reach it with ctx.channels.findOneOrFail('console')
        channels: [consoleChannel()],
        concurrencyMaxRuns: 8,
        claimTtlMs: 30_000,
    });
    // #endregion many

    return engine;
}
