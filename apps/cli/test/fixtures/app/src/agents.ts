/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { cron, defineModelAgent, http } from '@chamvi/app';
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

const USAGE = {
    inputTokens: {
        total: 1,
        noCache: 1,
        cacheRead: undefined,
        cacheWrite: undefined,
    },
    outputTokens: {
        total: 1,
        text: 1,
        reasoning: undefined,
    },
};

/** Answers every call with one text turn, so any number of runs complete. */
function echoModel(text: string) {
    return new MockLanguageModelV4({
        doStream: async () => ({
            stream: simulateReadableStream({
                chunks: [
                    { type: 'stream-start', warnings: [] },
                    { type: 'text-start', id: 't0' },
                    {
                        type: 'text-delta',
                        id: 't0',
                        delta: text,
                    },
                    { type: 'text-end', id: 't0' },
                    {
                        type: 'finish',
                        finishReason: { unified: 'stop', raw: undefined },
                        usage: USAGE,
                    },
                ],
            }),
        }),
    });
}

export const echo = defineModelAgent({
    name: 'echo',
    model: echoModel('echo'),
    instructions: 'Echo the payload back.',
    channels: [
        http.on(),
        cron.on('0 0 1 1 *'),
    ],
});
