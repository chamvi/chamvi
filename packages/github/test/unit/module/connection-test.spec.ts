/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomBytes } from 'node:crypto';
import { createKeyring, defineModelAgent } from '@chamvi/core';
import type { Agent } from '@chamvi/core';
import { ControllableClock, createFakeGithub } from '@chamvi/test-kit';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import {
    configModule,
    engineModule,
    httpModule,
    staticTokensModule,
    storeModule,
} from '@chamvi/app';
import type { IModule } from '@chamvi/app';
import { createModuleHarness } from '@chamvi/app/testing';
import type { ModuleHarness } from '@chamvi/app/testing';
import { githubModule } from '@chamvi/github/module';
import { verifyGithubApp } from '../../../src/app/verify.ts';
import { mockModel, textModel } from '../../utils/model.ts';
import {
    TOKEN,
    TOKENS,
    createRecordingLogger,
    freePort,
} from '../../utils/module.ts';

const clock = new ControllableClock(new Date('2026-10-20T10:00:00Z'));
const keyring = createKeyring([{ id: 'k1', key: randomBytes(32) }]);
const harnesses: ModuleHarness[] = [];

afterEach(async () => {
    for (const harness of harnesses.splice(0)) {
        await harness.stop();
    }
});

type Call = (method: string, path: string, body?: unknown) => Promise<Response>;

async function serve(modules: IModule[], agents: Agent[] = []): Promise<{ call: Call; lines: string[] }> {
    const port = await freePort();
    const logger = createRecordingLogger();
    const harness = await createModuleHarness({
        env: {
            CHAMVI_TOKENS: TOKENS,
            HOST: '127.0.0.1',
            PORT: String(port),
        },
        keyring,
        agents: agents.length > 0 ? agents : [defineModelAgent({
            name: 'assistant',
            model: mockModel([]),
            instructions: 'Answer.',
        })],
        modules: [
            configModule({ logger }),
            storeModule(),
            staticTokensModule(),
            engineModule(),
            httpModule({ metrics: false, rateLimit: false }),
            ...modules,
        ],
    });

    harnesses.push(harness);

    return {
        lines: logger.lines,
        call: (method, path, body) => fetch(`http://127.0.0.1:${port}${path}`, {
            method,
            headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
            ...(body !== undefined && { body: JSON.stringify(body) }),
        }),
    };
}

describe('the GitHub connection test', () => {
    const save = async (call: Call, appId: string, privateKey: string, extra: Record<string, unknown> = {}) => {
        const response = await call('PUT', '/connections/github/config', {
            settings: { appId, ...extra },
            secrets: { set: { privateKey, webhookSecret: 'whsec-value' } },
        });

        expect(response.status).toBe(200);
    };

    it('calls GET /app with the App JWT and the saved values', async () => {
        const fake = createFakeGithub({ appId: '1', clock });
        const { call } = await serve([githubModule({
            env: {},
            clock,
            fetch: fake.fetch,
        })]);

        await save(call, '1', fake.privateKey);

        const response = await call('POST', '/connections/github/test', { settings: { appId: '999' } });

        expect(await response.json()).toEqual({ ok: true });
        expect(fake.requests.some((request) => request.method === 'GET' && request.path === '/app')).toBe(true);
    });

    it('honours the saved API URL', async () => {
        const seen: string[] = [];
        const fake = createFakeGithub({ appId: '1', clock });
        const { call } = await serve([githubModule({
            env: {},
            clock,
            fetch: async (input, init) => {
                seen.push(String(input));

                return fake.fetch(String(input).replace('https://ghe.test/api/v3', 'https://api.github.com'), init);
            },
        })]);

        await save(call, '1', fake.privateKey, { baseUrl: 'https://ghe.test/api/v3' });

        expect(await (await call('POST', '/connections/github/test')).json()).toEqual({ ok: true });
        expect(seen).toEqual(['https://ghe.test/api/v3/app']);
    });

    it('reports a refusal without a value', async () => {
        const fake = createFakeGithub({ appId: '1', clock });
        const { call, lines } = await serve([githubModule({
            env: {},
            clock,
            fetch: fake.fetch,
        })]);

        await save(call, '2', fake.privateKey);

        const text = await (await call('POST', '/connections/github/test')).text();

        expect(JSON.parse(text)).toEqual({ ok: false, message: 'GitHub refused the App ID or private key.' });
        expect(text).not.toContain(fake.privateKey);
        expect(lines.join('\n')).not.toContain('whsec-value');
    });

    it('reports a stored value the App refuses without quoting it', async () => {
        const fake = createFakeGithub({ appId: '1', clock });
        const { call } = await serve([githubModule({
            env: {},
            clock,
            fetch: fake.fetch,
        })]);

        await save(call, '1', fake.privateKey, { baseUrl: 'http://not-https.test' });

        const text = await (await call('POST', '/connections/github/test')).text();

        expect(JSON.parse(text).ok).toBe(false);
        expect(text).not.toContain('not-https.test');
    });

    it('tests each module with its own fetch, not the first module\'s', async () => {
        const fake = createFakeGithub({ appId: '1', clock });
        const first: string[] = [];
        const second: string[] = [];
        const recording = (seen: string[]): typeof fetch => async (input, init) => {
            seen.push(String(input));

            return fake.fetch(input, init);
        };
        const { call } = await serve([
            githubModule({
                env: {},
                clock,
                fetch: recording(first),
            }),
            githubModule({
                name: 'acme',
                agents: ['someone-else'],
                env: {},
                clock,
                fetch: recording(second),
            }),
        ]);
        const response = await call('PUT', '/connections/acme/config', {
            settings: { appId: '1' },
            secrets: { set: { privateKey: fake.privateKey, webhookSecret: 'whsec-value' } },
        });

        expect(response.status).toBe(200);
        expect(await (await call('POST', '/connections/acme/test')).json()).toEqual({ ok: true });
        expect(second).toEqual(['https://api.github.com/app']);
        expect(first).toEqual([]);
    });

    it('is bounded by its signal', async () => {
        const fake = createFakeGithub({ appId: '1', clock });
        const controller = new AbortController();
        const reason = new Error('stop');
        let started = false;
        const pending = verifyGithubApp({
            appId: '1',
            privateKey: fake.privateKey,
            clock,
            fetch: (_input, init) => new Promise((_resolve, reject) => {
                started = true;
                init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
            }),
        }, controller.signal);

        await expect.poll(() => started).toBe(true);
        controller.abort(reason);

        await expect(pending).rejects.toBe(reason);
    });
});

describe('the fallback module and targeted agents (R29)', () => {
    const fallback = () => githubModule({ env: {}, channel: { name: 'fallback' } });
    const targeted = (agents: string[]) => githubModule({
        name: 'acme',
        agents,
        env: {},
    });
    const agent = (channel: string) => defineModelAgent({
        name: 'triager',
        model: textModel(),
        instructions: 'Answer.',
        channels: [{ channel } as never],
    });

    it('refuses a subscriber of the fallback channel another module targets, in either setup order', async () => {
        const message = /subscribes to the channel "fallback".*"acme" targets it/;

        await expect(serve([fallback(), targeted(['triager'])], [agent('fallback')])).rejects.toThrow(message);
        await expect(serve([targeted(['triager']), fallback()], [agent('fallback')])).rejects.toThrow(message);
    });

    it('keeps a subscriber nothing else targets', async () => {
        await expect(serve([fallback(), targeted(['someone-else'])], [agent('fallback')])).resolves.toBeDefined();
    });
});
