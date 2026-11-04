/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    AppToken,
    FatalToolError,
    createApp,
    cron,
    defineModelAgent,
    defineTool,
} from '@chamvi/app';
import type { ILifecycleHook } from '@chamvi/app';
import { jsonSchema, simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

// calls the explode tool on every turn; the tool fails the run
const model = new MockLanguageModelV4({
    doStream: async () => ({
        stream: simulateReadableStream({
            chunks: [
                { type: 'stream-start', warnings: [] },
                {
                    type: 'tool-call',
                    toolCallId: 'call-0',
                    toolName: 'explode',
                    input: '{}',
                },
                {
                    type: 'finish',
                    finishReason: { unified: 'tool-calls', raw: undefined },
                    usage: {
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
                    },
                },
            ],
        }),
    }),
});

const explode = defineTool({
    description: 'Fails the run.',
    inputSchema: jsonSchema<Record<string, never>>({ type: 'object', properties: {} }),
    execute: async (): Promise<string> => {
        throw new FatalToolError('exploded');
    },
});

const fail = defineModelAgent({
    name: 'fail',
    model,
    instructions: 'Call explode.',
    tools: { explode },
    channels: [cron.on('0 0 1 1 *')],
});

declare global {
    // a test sets it to receive a call once the engine drained (the job's teardown)
    var chamviFailingDrained: (() => void) | undefined;
}

const drainedProbe = {
    name: 'drained-probe',
    async setup(container: { registerMany(token: typeof AppToken.LIFECYCLE_HOOKS, provider: { useValue: ILifecycleHook }): void }): Promise<void> {
        container.registerMany(AppToken.LIFECYCLE_HOOKS, {
            useValue: {
                name: 'drained-probe',
                drained: () => globalThis.chamviFailingDrained?.(),
            },
        });
    },
};

export default createApp({ agents: [fail], modules: [drainedProbe] });
