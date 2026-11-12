/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readFileSync } from 'node:fs';
import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import type { IEngine } from '@chamvi/core';
import { ControllableClock, mockModel, textModel } from '@chamvi/test-kit';
import { createChatEngine } from '../fixtures/readme-example.ts';
import { createFakeAdapter, createTextMessage } from '../utils/adapter.ts';
import { createMemoryState } from '../utils/chat.ts';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const engines: IEngine[] = [];

afterEach(async () => {
    vi.unstubAllEnvs();
    await Promise.all(engines.map((engine) => engine.stop()));
    engines.length = 0;
});

function stubEnv() {
    vi.stubEnv('CHAT_USERS', 'user-1');
    vi.stubEnv('APP_URL', 'https://chamvi.example');
}

describe('README example', () => {
    it('is the code of test/fixtures/readme-example.ts', () => {
        const readme = read('../../README.md');
        const blocks = readme.matchAll(/```typescript\n([\s\S]*?)```/g).map((m) => m[1]).toArray();

        expect(blocks).toContain(read('../fixtures/readme-example.ts'));
    });

    it('imports only the public entries and never a test helper', () => {
        const imports = read('../fixtures/readme-example.ts').matchAll(/from '([^']+)'/g).map((m) => m[1]).toArray();

        expect(imports.sort()).toEqual(['@chamvi/chat', '@chamvi/core', '@chamvi/core', 'ai', 'chat', 'chat', 'zod']);
    });

    it('initializes nothing before the engine starts, and serves the adapter\'s webhooks', () => {
        stubEnv();

        const adapter = createFakeAdapter();
        const engine = createChatEngine(textModel(), { adapter, state: createMemoryState() });

        expect(adapter.initializeCalls).toBe(0);
        expect(engine.getChannel('chat')?.in).toBeTypeOf('function');
    });

    it('answers an allowed user in the same chat, with one memory per chat, and ignores a stranger', async () => {
        stubEnv();

        const clock = new ControllableClock(new Date('2026-11-01T09:00:00Z'));
        const adapter = createFakeAdapter();
        const engine = createChatEngine(mockModel([
            {
                parts: [{
                    type: 'tool-call',
                    toolName: 'reply',
                    input: { text: 'Hello.' },
                }],
            },
            { parts: [{ type: 'text', text: 'done' }] },
        ]), {
            adapter,
            state: createMemoryState(),
            clock,
        });

        engines.push(engine);
        await engine.start();

        await adapter.deliver(createTextMessage({
            id: 'm-1',
            author: 'stranger',
            text: 'let me in',
        }));
        await adapter.deliver(createTextMessage({ id: 'm-2', text: 'hi there' }));
        await engine.idle();

        const { data: runs } = await engine.store.runs.find({});

        expect(runs).toHaveLength(1);
        expect(runs[0]?.status).toBe('completed');
        expect(runs[0]?.trigger.invoker).toEqual({
            id: 'user-1',
            kind: 'chat',
            bindings: [],
        });
        expect(runs[0]?.taint?.source).toBe('channel:chat');
        expect(runs[0]?.conversation?.scope.identity).toEqual(expect.objectContaining({
            account: 'fake',
            chat: 'fake:chat-1',
            audience: 'direct:user-1',
        }));
        expect(adapter.posts).toEqual([{ threadId: 'fake:chat-1', message: { raw: 'Hello.' } }]);
    });

    it('needs the user list and the app URL', () => {
        stubEnv();
        vi.stubEnv('CHAT_USERS', '');

        expect(() => createChatEngine(textModel(), {
            adapter: createFakeAdapter(),
            state: createMemoryState(),
        })).toThrow('CHAT_USERS');
    });
});
