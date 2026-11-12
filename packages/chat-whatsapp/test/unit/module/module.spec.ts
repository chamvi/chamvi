/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomBytes } from 'node:crypto';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import { InvalidAgentDefinitionError, defineModelAgent } from '@chamvi/core';
import type { IConnectionHandle, IStore } from '@chamvi/core';
import {
    AppToken,
    configModule,
    createLogger,
    engineModule,
    storeModule,
} from '@chamvi/app';
import { buildModuleHarness } from '@chamvi/app/testing';
import type { ModuleHarness } from '@chamvi/app/testing';
import { whatsappModule } from '@chamvi/chat-whatsapp/module';
import type { WhatsAppModuleOptions } from '@chamvi/chat-whatsapp/module';
import { ControllableClock, textModel } from '@chamvi/test-kit';
import {
    ALICE,
    createFakeSockets,
    createMemoryState,
    settle,
} from '../../utils/whatsapp.ts';

const QR = '2@SECRET-MODULE-QR,abc';
const KEYS = `k1:${randomBytes(32).toString('base64')}`;
const harnesses: ModuleHarness[] = [];

afterEach(async () => {
    await Promise.all(harnesses.map((harness) => harness.stop()));
    harnesses.length = 0;
});

function world(input: {
    env?: Record<string, string>; 
    check?: boolean; 
    patch?: Partial<WhatsAppModuleOptions> 
} = {}) {
    const clock = new ControllableClock(new Date('2026-11-06T09:00:00Z'));
    const lines: string[] = [];
    const logger = createLogger({
        level: 'debug',
        clock,
        write: (line: string) => {
            lines.push(line);
        },
    });
    const sockets = createFakeSockets();
    const module = whatsappModule({
        connection: 'bot',
        account: 'support',
        policy: { senders: [ALICE] },
        resolveInvoker: (identity) => ({
            id: identity.sender, 
            kind: 'whatsapp', 
            bindings: [], 
        }),
        state: createMemoryState(),
        approvalUrl: (ref) => `https://chamvi.example/ui/approvals?run=${ref.runId}`,
        socketFactory: sockets.factory,
        leaseTtlMs: 3000,
        ...input.patch,
    });
    const harness = buildModuleHarness({
        env: input.env ?? { CHAMVI_ENCRYPTION_KEYS: KEYS },
        ...(input.check !== undefined ? { check: input.check } : {}),
        agents: [defineModelAgent({
            name: 'assistant',
            model: textModel(),
            instructions: 'Answer.',
            channels: [module.on()],
        })],
        modules: [
            configModule({ clock, logger }),
            storeModule(),
            engineModule(),
            module,
        ],
    });

    harnesses.push(harness);

    return {
        clock,
        lines,
        sockets,
        module,
        harness,
        store: () => harness.container.resolve(AppToken.STORE) as IStore,
        handle: () => harness.container.resolveAll(AppToken.CONNECTIONS)[0] as IConnectionHandle,
    };
}

describe('whatsappModule', () => {
    it('contributes the channel and a connection handle', async () => {
        const w = world();

        await w.harness.setup();

        const engine = w.harness.container.resolve(AppToken.ENGINE);

        expect(engine.getChannel('chat')).toBe(w.module.channel);
        expect(w.harness.container.resolveAll(AppToken.CONNECTIONS)).toEqual([w.module.handle]);
        expect(w.handle().name).toBe('bot');
        expect(w.handle().type).toBe('whatsapp');
        expect(w.module.name).toBe('chamvi:channel:chat');

        // started: the lease is taken, the socket built
        expect(w.sockets.sockets).toHaveLength(1);
        expect(w.handle().status()).toBe('connecting');
        expect(await w.store().connections!.findOne('bot')).toMatchObject({ type: 'whatsapp', keyId: 'k1' });
    });

    it('shows the pairing QR through the handle only while pairing, and never logs it', async () => {
        const w = world();
        const seen: string[] = [];

        await w.harness.setup();

        const handle = w.handle();
        const unsubscribe = handle.subscribe(() => {
            seen.push(`${handle.status()}:${handle.widgets().length}`);
        });
        const socket = w.sockets.last();

        socket.emit('connection.update', { qr: QR });

        expect(handle.status()).toBe('pairing');
        expect(handle.widgets()).toEqual([{ kind: 'qr', value: QR }]);

        socket.open();

        expect(handle.status()).toBe('connected');
        expect(handle.widgets()).toEqual([]);
        expect(seen.at(-1)).toBe('connected:0');
        unsubscribe();

        socket.close(401);
        expect(handle.status()).toBe('logged_out');

        await w.harness.stop();
        expect(handle.status()).toBe('disconnected');
        expect(w.lines.join('\n')).not.toContain('SECRET-MODULE-QR');
    });

    it('never logs the QR a throwing subscriber carries', async () => {
        const w = world();

        await w.harness.setup();
        w.handle().subscribe(() => {
            throw new Error(`could not render ${QR}`);
        });
        w.sockets.last().emit('connection.update', { qr: QR });

        expect(w.lines.join('\n')).toContain('A connection subscriber threw.');
        expect(w.lines.join('\n')).not.toContain('SECRET-MODULE-QR');
    });

    it('reset through the handle clears the session and pairs again', async () => {
        const w = world();

        await w.harness.setup();

        const first = w.sockets.last();

        await first.config.auth.keys.set({ session: { 'alice.0': new Uint8Array([1]) } });
        first.open();
        await w.handle().actions.reset!();

        expect(w.sockets.sockets).toHaveLength(2);
        expect(await w.store().connections!.findEntry('bot', 'key:session:alice.0')).toBeUndefined();

        w.sockets.last().emit('connection.update', { qr: QR });
        expect(w.handle().widgets()).toEqual([{ kind: 'qr', value: QR }]);
    });

    it('acquires nothing and writes nothing in a check', async () => {
        const w = world({ check: true });

        await w.harness.setup();
        await settle();

        expect(w.sockets.sockets).toEqual([]);
        expect(await w.store().connections!.find()).toEqual([]);
        expect(await w.store().locks.acquire('connection:bot', 'probe', 1000)).toBe(true);
    });

    it('a check still refuses a malformed keyring without echoing it', async () => {
        const w = world({ check: true, env: { CHAMVI_ENCRYPTION_KEYS: 'k1:not-a-key' } });

        await expect(w.harness.setup()).rejects.toThrow(/^CHAMVI_ENCRYPTION_KEYS: /);
        await expect(w.harness.setup()).rejects.not.toThrow(/not-a-key/);
    });

    it('fails setup naming the variable when the keyring is missing', async () => {
        const w = world({ env: {} });

        await expect(w.harness.setup()).rejects.toThrow(InvalidAgentDefinitionError);
        await expect(w.harness.setup()).rejects.toThrow(/CHAMVI_ENCRYPTION_KEYS is not set/);
        expect(w.sockets.sockets).toEqual([]);
    });

    it('refuses malformed options when the factory is called', () => {
        expect(() => whatsappModule({ connection: 'Not A Name' } as never)).toThrow(InvalidAgentDefinitionError);
        expect(() => whatsappModule({
            connection: 'bot',
            account: '',
            policy: { senders: [] },
            resolveInvoker: () => undefined,
            state: createMemoryState(),
        })).toThrow(InvalidAgentDefinitionError);
        expect(() => whatsappModule({ connection: 'bot', leaseTtlMs: 2_147_483_648 } as never)).toThrow(/leaseTtlMs/);
        expect(() => whatsappModule({ connection: 'bot', approvalUrl: 'https://chamvi.example' } as never)).toThrow(/approvalUrl/);
    });

    it('needs an approval url or CHAMVI_PUBLIC_URL', async () => {
        const w = world({ patch: { approvalUrl: undefined } });

        await expect(w.harness.setup()).rejects.toThrow(/CHAMVI_PUBLIC_URL/);
    });
});
