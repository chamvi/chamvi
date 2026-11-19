/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */


import type { PayloadResult } from '../types.ts';

/** The start-run payload: JSON, an empty text being `{}`. */
export function parsePayload(text: string): PayloadResult {
    if (!text.trim()) {
        return { ok: true, value: {} };
    }

    try {
        return { ok: true, value: JSON.parse(text) };
    } catch (e) {
        return { ok: false, message: `The payload is not valid JSON (${e instanceof Error ? e.message : String(e)}). Fix it, or send {} for an empty payload.` };
    }
}

/** 32 random hex characters; `crypto.getRandomValues` works outside a secure context too, unlike `randomUUID`. */
export function newIdempotencyKey(): string {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * The idempotency keys of one start-run form: a retry of the same payload text
 * after a failure keeps its key (so a start whose answer was lost dedupes to
 * that run), a changed payload or a start after a success gets a fresh one.
 */
export function createStartKeys(mint: () => string = newIdempotencyKey) {
    let attempt: { text: string; key: string } | undefined;

    return {
        keyFor(text: string): string {
            if (!attempt || attempt.text !== text) {
                attempt = { text, key: mint() };
            }

            return attempt.key;
        },
        succeeded(): void {
            attempt = undefined;
        },
    };
}
