/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { MockLanguageModelV4, MockTranscriptionModelV4 } from 'ai/test';

function waitForAbort(signal: AbortSignal | undefined): Promise<never> {
    return new Promise((_resolve, reject) => {
        if (!signal) {
            return;
        }

        if (signal.aborted) {
            reject(signal.reason);

            return;
        }

        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
}

/** A model that never answers; its call rejects only once its abort signal fires. */
export function hangingModel() {
    return new MockLanguageModelV4({
        doGenerate: async (options) => waitForAbort(options.abortSignal),
        doStream: async (options) => waitForAbort(options.abortSignal),
    });
}

/**
 * A fake transcription model recording each call's options: call n answers
 * `results[n]` (the last one repeats): a text, a thrown error, or (`'hang'`)
 * a wait for its abort.
 */
export function transcriptionModel(...results: [string | Error | 'hang', ...Array<string | Error | 'hang'>]) {
    const calls: Array<{
        audio: Uint8Array | string;
        mediaType: string;
        abortSignal?: AbortSignal;
    }> = [];
    const model = new MockTranscriptionModelV4({
        doGenerate: async (options) => {
            calls.push({
                audio: options.audio,
                mediaType: options.mediaType,
                ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
            });

            const result = results[Math.min(calls.length, results.length) - 1]!;

            if (result === 'hang') {
                return waitForAbort(options.abortSignal);
            }

            if (Error.isError(result)) {
                throw result;
            }

            return {
                text: result,
                segments: [],
                language: undefined,
                durationInSeconds: undefined,
                warnings: [],
                response: { timestamp: new Date(0), modelId: 'mock-model-id' },
            };
        },
    });

    return Object.assign(model, { calls });
}
