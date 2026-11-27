/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export type Step = {
    runId: string;
    index: number;
    kind: 'llm' | 'tool' | 'wait';
    name?: string;
    input?: unknown;
    output?: unknown;
    error?: unknown;
    startedAt: Date;
    finishedAt: Date;
};
