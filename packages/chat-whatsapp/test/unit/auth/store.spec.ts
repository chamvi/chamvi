/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomBytes } from 'node:crypto';
import { proto } from 'baileys';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import {
    ConnectionHeldError,
    DecryptionFailedError,
    InvalidAgentDefinitionError,
    InvalidRunStateError,
    createConnectionVault,
    createKeyring,
    createMemoryStore,
} from '@chamvi/core';
import type { IKeyring, IStore } from '@chamvi/core';
import { createStoreWhatsAppAuth } from '@chamvi/chat-whatsapp';
import type { WhatsAppAuthLease } from '@chamvi/chat-whatsapp';
import { ControllableClock } from '@chamvi/test-kit';
import { createWhatsAppFixture, settle } from '../../utils/whatsapp.ts';

const keyring: IKeyring = createKeyring([{ id: 'k1', key: randomBytes(32) }]);
const leases: WhatsAppAuthLease[] = [];

afterEach(async () => {
    await Promise.all(leases.map((lease) => lease.release()));
    leases.length = 0;
});

function world(ttl = 3000) {
    const clock = new ControllableClock(new Date('2026-11-01T09:00:00Z'));
    const store: IStore = createMemoryStore({ clock });
    const provider = (owner: string, holderClock: ControllableClock = clock) => createStoreWhatsAppAuth({
        vault: createConnectionVault({
            store, 
            keyring, 
            clock: holderClock, 
        }),
        connection: 'bot',
        owner,
        leaseTtlMs: ttl,
    });

    return {
        clock,
        store,
        provider,
    };
}

async function take(lease: Promise<WhatsAppAuthLease>): Promise<WhatsAppAuthLease> {
    const value = await lease;

    leases.push(value);

    return value;
}

describe('createStoreWhatsAppAuth', () => {
    it('refuses malformed options', () => {
        const { store } = world();
        const vault = createConnectionVault({ store, keyring });

        expect(() => createStoreWhatsAppAuth(undefined as never)).toThrow(InvalidAgentDefinitionError);
        expect(() => createStoreWhatsAppAuth({ vault: {} as never, connection: 'bot' })).toThrow(InvalidAgentDefinitionError);
        expect(() => createStoreWhatsAppAuth({ vault, connection: 'Not A Name' })).toThrow(InvalidAgentDefinitionError);
        expect(() => createStoreWhatsAppAuth({
            vault, 
            connection: 'bot', 
            owner: '', 
        })).toThrow(InvalidAgentDefinitionError);
    });

    it('pairs and persists creds through the connector', async () => {
        const { store, provider } = world();
        const fixture = createWhatsAppFixture({ patch: { auth: provider('a') } });

        await fixture.engine.start();

        const socket = fixture.sockets.last();

        socket.config.auth.creds.registered = true;
        socket.config.auth.creds.me = { id: '4900000000000:3@s.whatsapp.net' };
        socket.emit('creds.update', { registered: true });
        socket.open();
        await fixture.engine.stop();

        expect(fixture.errors).toEqual([]);

        // sealed at rest: the stored creds hold no plaintext
        const stored = await store.connections!.findEntry('bot', 'creds');

        expect(stored).toBeInstanceOf(Uint8Array);
        expect(Buffer.from(stored!).toString('utf8')).not.toContain('4900000000000');

        const lease = await take(provider('b').acquire(new AbortController().signal));

        expect(lease.auth.creds.registered).toBe(true);
        expect(lease.auth.creds.me?.id).toBe('4900000000000:3@s.whatsapp.net');
        expect(lease.auth.creds.noiseKey.private).toEqual(socket.config.auth.creds.noiseKey.private);
    });

    it('a new provider instance after release loads the same creds and keys', async () => {
        const { provider } = world();
        const first = await provider('a').acquire(new AbortController().signal);

        await first.auth.keys.set({
            'pre-key': { 1: { public: new Uint8Array([1, 2]), private: new Uint8Array([3, 4]) } },
            session: { 'alice.0': new Uint8Array([9, 9]) },
            'app-state-sync-key': { AAAA: proto.Message.AppStateSyncKeyData.fromObject({ keyData: new Uint8Array([7]) }) },
        });
        await first.saveCreds();
        await first.flush();
        await first.release();

        const second = await take(provider('a').acquire(new AbortController().signal));

        expect(second.auth.creds.signedIdentityKey.public).toEqual(first.auth.creds.signedIdentityKey.public);
        expect(await second.auth.keys.get('pre-key', ['1', '2'])).toEqual({ 1: { public: Buffer.from([1, 2]), private: Buffer.from([3, 4]) } });
        expect(await second.auth.keys.get('session', ['alice.0'])).toEqual({ 'alice.0': Buffer.from([9, 9]) });

        const sync = await second.auth.keys.get('app-state-sync-key', ['AAAA']);

        expect(sync.AAAA).toBeInstanceOf(proto.Message.AppStateSyncKeyData);
        expect(Buffer.from(sync.AAAA!.keyData!)).toEqual(Buffer.from([7]));
    });

    it('starts with fresh creds when the connection holds none', async () => {
        const { provider } = world();
        const lease = await take(provider('a').acquire(new AbortController().signal));

        expect(lease.auth.creds.registered).toBe(false);
        expect(lease.auth.creds.noiseKey.private).toBeInstanceOf(Uint8Array);
    });

    it('acquire while held rejects ConnectionHeldError', async () => {
        const { provider } = world();

        await take(provider('a').acquire(new AbortController().signal));

        const outcome = provider('b').acquire(new AbortController().signal);

        await expect(outcome).rejects.toBeInstanceOf(ConnectionHeldError);
        await expect(outcome).rejects.toMatchObject({ code: 'connection_held' });
    });

    it('after the ttl another owner acquires the session of a holder that stopped renewing', async () => {
        const { clock, provider } = world();
        // the holder's renewals run on a clock that never moves: it behaves like a crashed process
        const holder = await take(provider('a', new ControllableClock(clock.now())).acquire(new AbortController().signal));

        await holder.auth.keys.set({ session: { 'alice.0': new Uint8Array([1]) } });

        clock.advance(2999);
        await expect(provider('b').acquire(new AbortController().signal)).rejects.toBeInstanceOf(ConnectionHeldError);

        clock.advance(1);

        const next = await take(provider('b').acquire(new AbortController().signal));

        expect(await next.auth.keys.get('session', ['alice.0'])).toEqual({ 'alice.0': Buffer.from([1]) });
        // the old holder's writes are fenced out
        await expect(holder.auth.keys.set({ session: { 'alice.0': new Uint8Array([2]) } })).rejects.toMatchObject({ code: 'lease_lost' });
        expect(await next.auth.keys.get('session', ['alice.0'])).toEqual({ 'alice.0': Buffer.from([1]) });
    });

    it('a key set with null deletes, in the same batch as the other changes', async () => {
        const { store, provider } = world();
        const lease = await take(provider('a').acquire(new AbortController().signal));

        await lease.auth.keys.set({ session: { a: new Uint8Array([1]), b: new Uint8Array([2]) } });
        await lease.auth.keys.set({ session: { a: null as never, c: new Uint8Array([3]) } });

        expect(await lease.auth.keys.get('session', ['a', 'b', 'c'])).toEqual({
            b: Buffer.from([2]),
            c: Buffer.from([3]),
        });
        expect(await store.connections!.findEntry('bot', 'key:session:a')).toBeUndefined();
        expect(await store.connections!.findEntry('bot', 'key:session:c')).toBeInstanceOf(Uint8Array);
    });

    it('clear removes the session, creds included', async () => {
        const { store, provider } = world();
        const lease = await take(provider('a').acquire(new AbortController().signal));

        await lease.saveCreds();
        await lease.auth.keys.set({ session: { a: new Uint8Array([1]) } });
        await lease.auth.keys.clear!();

        expect(await store.connections!.findEntries('bot', ['creds', 'key:session:a'])).toEqual(new Map());
    });

    it('a reset acquire recreates the session under a fresh data key, also when no keyring key unwraps it', async () => {
        const { store, provider } = world();
        const lease = await provider('a').acquire(new AbortController().signal);

        lease.auth.creds = { ...lease.auth.creds, registered: true };
        await lease.saveCreds();
        await lease.auth.keys.set({ session: { a: new Uint8Array([1]) } });
        await lease.release();

        const rotated = createConnectionVault({ store, keyring: createKeyring([{ id: 'k2', key: randomBytes(32) }]) });
        const lost = createStoreWhatsAppAuth({ vault: rotated, connection: 'bot' });

        await expect(lost.acquire(new AbortController().signal)).rejects.toBeInstanceOf(DecryptionFailedError);

        const fresh = await take(lost.acquire(new AbortController().signal, { reset: true }));

        expect(fresh.auth.creds.registered).toBe(false);
        expect(await fresh.auth.keys.get('session', ['a'])).toEqual({});
        expect((await store.connections!.findOneOrFail('bot')).keyId).toBe('k2');
        expect(await store.connections!.findEntries('bot', ['creds', 'key:session:a'])).toEqual(new Map());
    });

    it('a reset acquire while the session is held elsewhere deletes nothing', async () => {
        const { store, provider } = world();
        const holder = await take(provider('a').acquire(new AbortController().signal));

        await holder.saveCreds();
        await expect(provider('b').acquire(new AbortController().signal, { reset: true }))
            .rejects.toBeInstanceOf(ConnectionHeldError);
        expect(await store.connections!.findEntry('bot', 'creds')).toBeInstanceOf(Uint8Array);
    });

    it('saveCreds persists the creds object the lease holds now', async () => {
        const { provider } = world();
        const lease = await provider('a').acquire(new AbortController().signal);
        const replaced = { ...lease.auth.creds, registered: true };

        lease.auth.creds = replaced;
        await lease.saveCreds();
        await lease.release();

        const next = await take(provider('a').acquire(new AbortController().signal));

        expect(next.auth.creds.registered).toBe(true);
    });

    it('writes after release are refused', async () => {
        const { provider } = world();
        const lease = await provider('a').acquire(new AbortController().signal);

        await lease.release();

        await expect(lease.saveCreds()).rejects.toBeInstanceOf(InvalidRunStateError);
        await expect(Promise.resolve(lease.auth.keys.set({ session: { a: new Uint8Array([1]) } }))).rejects.toBeInstanceOf(InvalidRunStateError);
        // a second release is harmless
        await lease.release();
    });

    it('an aborted signal acquires nothing', async () => {
        const { provider } = world();
        const reason = new Error('stopped');

        await expect(provider('a').acquire(AbortSignal.abort(reason))).rejects.toBe(reason);

        const lease = await take(provider('b').acquire(new AbortController().signal));

        expect(lease.auth.creds).toBeDefined();
        await settle();
    });
});
