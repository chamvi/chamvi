/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */


import type { RunWire } from '@chamvi/http-kit';

export function formatTokens(count: number): string {
    if (count >= 1_000_000) {
        return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    }

    if (count >= 1000) {
        return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k`;
    }

    return String(count);
}

export function formatDuration(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const pad = (value: number) => String(value).padStart(2, '0');

    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** How long a run took, or runs so far. */
export function runDuration(run: RunWire, now: number): number | undefined {
    if (!run.startedAt) {
        return undefined;
    }

    const end = run.finishedAt ? Date.parse(run.finishedAt) : now;

    return end - Date.parse(run.startedAt);
}

/** Use the entropy tail so nearby UUID v7 runs have distinguishable short labels. */
export function shortId(id: string): string {
    return id.slice(-8);
}

/** The JSON of a value, pretty, for a code block; `undefined` reads as `—`. */
export function toJson(value: unknown): string {
    if (value === undefined) {
        return '—';
    }

    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}
