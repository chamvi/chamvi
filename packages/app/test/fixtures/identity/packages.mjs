/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

// Runs on the built packages (spawned by test/unit/loader/package-identity.spec.ts)
// with the cwd a temp dir outside the repo: package agents (one built, one a
// linked TypeScript workspace package, each with decoy copies of @chamvi/core
// and ai of its own that throw when loaded) import the app's copies only
// through the resolve hook. A tool of each injects a key a module provided.
import { AppToken, createApp, storeModule } from '@chamvi/app';
import { createMemoryStore, defineContextKey } from '@chamvi/core';
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

const usage = {
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

function createModel() {
    const turns = [
        [{
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'greet',
            input: '{}',
        }],
        [{ type: 'text-start', id: 't' }, {
            type: 'text-delta',
            id: 't',
            delta: 'done',
        }, { type: 'text-end', id: 't' }],
    ];
    let turn = 0;

    return new MockLanguageModelV4({
        doStream: async () => {
            const parts = turns[turn++] ?? [];
            const hasToolCall = parts.some((part) => part.type === 'tool-call');
            const finishReason = { unified: hasToolCall ? 'tool-calls' : 'stop', raw: undefined };

            return {
                stream: simulateReadableStream({
                    chunks: [{ type: 'stream-start', warnings: [] }, ...parts, {
                        type: 'finish',
                        finishReason,
                        usage,
                    }],
                }),
            };
        },
    });
}

const key = defineContextKey('greeting');

globalThis.chamviGreetingKey = key;
// one model per agent: each package is imported once (by the first app) and keeps its model
globalThis.chamviModels = { 'built-greeter': createModel(), 'source-greeter': createModel() };

const results = {};

// the models go in directly: through a models provider the AI SDK would wrap the mock

for (const agent of ['built-greeter', 'source-greeter']) {
    const store = createMemoryStore();
    const app = createApp({
        agents: ['@fixture/built', '@fixture/source'],
        modules: [{
            name: 'greeting',
            async setup(container) {
                container.registerMany(AppToken.LIFECYCLE_HOOKS, { useValue: { name: 'greeting', engineCreated: (engine) => engine.provide(key, 'hello from the module') } });
            },
        }, storeModule({ store })],
    });

    const result = await app.runJob({
        agent,
        env: {
            CHAMVI_DRAIN_TIMEOUT_MS: '1000',
            CHAMVI_LOG_LEVEL: 'error',
        },
    });
    const steps = result.runId ? await store.steps.find(result.runId) : [];
    const tool = steps.find((step) => step.kind === 'tool');

    results[agent] = {
        status: result.status,
        output: tool?.output ?? null,
        error: tool?.error ?? null,
        revision: (await store.agentRevisions.findOne(agent))?.hash ?? null,
    };
}

process.stdout.write(`${JSON.stringify(results)}\n`);
