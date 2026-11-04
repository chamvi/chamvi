/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { makeWASocket } from 'baileys';
import type { Adapter, StateAdapter } from 'chat';
import {
    afterEach,
    describe,
    expect,
    expectTypeOf,
    it,
} from 'vitest';
import { defineAgent } from '@chamvi/core';
import {
    configModule,
    createApp,
    createLogger,
} from '@chamvi/app';
import type { IApp } from '@chamvi/app';
import * as pkg from '@chamvi/chat';
import { chatModule } from '@chamvi/chat/module';
import { createWhatsAppChat } from '@chamvi/chat-whatsapp';
import type { WhatsAppSocketFactory } from '@chamvi/chat-whatsapp';
import { ControllableClock, textModel } from '@chamvi/test-kit';
import { createWhatsAppAdapter } from '../../../src/whatsapp/adapter.ts';
import { createFileAuthProvider, createRecordingAuth } from '../../utils/auth.ts';
import { createFakeSockets, createMemoryState, createWhatsAppFixture } from '../../utils/whatsapp.ts';

describe('@chamvi/chat-whatsapp', () => {
    it('pins the one verified Baileys version (its LID mapping trust depends on it)', () => {
        const manifest = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as {
            peerDependencies: Record<string, string>;
            devDependencies: Record<string, string>;
        };
        const installed = (createRequire(import.meta.url)('baileys/package.json') as { version: string }).version;

        expect(manifest.peerDependencies.baileys).toBe('7.0.0-rc14');
        expect(manifest.devDependencies.baileys).toBe('7.0.0-rc14');
        expect(installed).toBe('7.0.0-rc14');
    });

    it('keeps @chamvi/chat\'s main entry free of WhatsApp', () => {
        expect(Object.keys(pkg).filter((key) => /whatsapp/i.test(key))).toEqual([]);
    });

    it('builds a chat 4.44.0 Adapter without a cast, and takes Baileys\' makeWASocket as the default factory', () => {
        expectTypeOf(createWhatsAppAdapter).returns.toMatchTypeOf<Adapter>();
        expectTypeOf(makeWASocket).toMatchTypeOf<WhatsAppSocketFactory>();
    });

    it('wires the Chat, the ingress and the channel without touching auth or a socket', () => {
        const {
            setup,
            auth,
            sockets,
        } = createWhatsAppFixture();

        expect(setup.chat.getAdapter('whatsapp')).toBe(setup.ingress);
        expect(setup.channel.name).toBe('chat');
        expect(setup.channel.untrusted).toBe(true);
        expect(setup.channel.in).toBeUndefined();
        expect(auth.signals).toEqual([]);
        expect(sockets.sockets).toEqual([]);
        expect(setup.status()).toBe('stopped');
    });
});

describe('test-only filesystem auth provider', () => {
    it('keeps creds and keys across a restart and refuses a second holder', async () => {
        const {
            mkdtemp,
            rm,
            stat,
        } = await import('node:fs/promises');
        const { tmpdir } = await import('node:os');
        const { join } = await import('node:path');
        const folder = await mkdtemp(join(tmpdir(), 'chamvi-wa-'));
        const auth = join(folder, 'auth');

        try {
            const provider = createFileAuthProvider(auth);
            const first = await provider.acquire(new AbortController().signal);

            await expect(provider.acquire(new AbortController().signal)).rejects.toThrow(/in use/);

            first.auth.creds.registered = true;
            await first.saveCreds();
            await first.auth.keys.set({ session: { 'a.0': new Uint8Array([7]) } });
            await first.flush();
            await first.release();

            expect((await stat(auth)).mode & 0o777).toBe(0o700);
            expect((await stat(join(auth, 'creds.json'))).mode & 0o777).toBe(0o600);
            expect((await stat(join(auth, 'keys.json'))).mode & 0o777).toBe(0o600);

            const second = await provider.acquire(new AbortController().signal);

            expect(second.auth.creds.registered).toBe(true);
            expect(await second.auth.keys.get('session', ['a.0'])).toEqual({ 'a.0': Buffer.from([7]) });
            await second.release();
        } finally {
            await rm(folder, { recursive: true, force: true });
        }
    });
});

const TOKENS = JSON.stringify([{
    value: 'a-static-token-of-length',
    id: 'ops',
    permissions: ['*'],
}]);

const apps: IApp[] = [];

afterEach(async () => {
    await Promise.all(apps.map((app) => app.stop()));
    apps.length = 0;
});

/** the state adapter, every call recorded by method name */
function recordingState(calls: string[]): StateAdapter {
    const state = createMemoryState();

    return new Proxy(state, {
        get(target, key, receiver) {
            const value: unknown = Reflect.get(target, key, receiver);

            if (typeof value !== 'function') {
                return value;
            }

            return (...args: unknown[]) => {
                calls.push(String(key));

                return (value as (...input: unknown[]) => unknown).apply(target, args);
            };
        },
    });
}

describe('chatModule under start --check', () => {
    it('check_no_auth_acquire_or_socket for a WhatsApp setup', async () => {
        const stateCalls: string[] = [];
        const auth = createRecordingAuth();
        const sockets = createFakeSockets();
        const setup = createWhatsAppChat({
            account: 'support',
            auth: auth.provider,
            policy: { senders: ['491701111111@s.whatsapp.net'] },
            resolveInvoker: () => undefined,
            state: recordingState(stateCalls),
            approvalUrl: () => 'https://chamvi.example/ui/approvals',
            onPairing: () => undefined,
            socketFactory: sockets.factory,
        });
        const app = createApp({
            agents: [defineAgent({
                name: 'assistant',
                model: textModel(),
                instructions: 'Answer.',
                channels: [setup.channel.on()],
            })],
            modules: [
                configModule({
                    clock: new ControllableClock(new Date('2026-11-01T09:00:00Z')),
                    logger: createLogger({ level: 'error', write: () => undefined }),
                }),
                chatModule({ channel: setup.channel }),
            ],
        });

        apps.push(app);

        await expect(app.check({ env: { CHAMVI_TOKENS: TOKENS, PORT: '4999' } })).resolves.toEqual({ issues: [] });

        expect(auth.signals).toEqual([]);
        expect(auth.trace).toEqual([]);
        expect(sockets.sockets).toEqual([]);
        expect(stateCalls).toEqual([]);
        expect(setup.status()).toBe('stopped');
    });
});
