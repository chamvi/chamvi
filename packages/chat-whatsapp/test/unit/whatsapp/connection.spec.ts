/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomBytes } from 'node:crypto';
import { DisconnectReason } from 'baileys';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import {
    ConnectionHeldError,
    InvalidRunStateError,
    createConnectionVault,
    createKeyring,
    createMemoryStore,
} from '@chamvi/core';
import type { IEngine, IKeyring, IStore } from '@chamvi/core';
import {
    WHATSAPP_AUTH_ERROR_CODE,
    WHATSAPP_CONNECTION_ERROR_CODE,
    WHATSAPP_RECONNECT,
    WHATSAPP_SHUTDOWN_TIMEOUT_MS,
    createStoreWhatsAppAuth,
} from '@chamvi/chat-whatsapp';
import type {
    IWhatsAppAuthProvider,
    WhatsAppAuthLease,
    WhatsAppChatOptions,
    WhatsAppConnectionStatus,
} from '@chamvi/chat-whatsapp';
import { ControllableClock } from '@chamvi/test-kit';
import { createWhatsAppConnection } from '../../../src/whatsapp/connection.ts';
import { createRecordingAuth, deferred } from '../../utils/auth.ts';
import { createFakeSockets, createWhatsAppFixture, settle } from '../../utils/whatsapp.ts';
import type { WhatsAppFixture } from '../../utils/whatsapp.ts';

const QR = '2@SECRET-PAIRING-REFERENCE,abc,def';
const TTL = 3000;
const keyring = createKeyring([{ id: 'k1', key: randomBytes(32) }]);
const engines: IEngine[] = [];
const leases: WhatsAppAuthLease[] = [];

afterEach(async () => {
    await Promise.all(engines.map((engine) => engine.stop()));
    engines.length = 0;
    await Promise.all(leases.map((lease) => lease.release()));
    leases.length = 0;
});

/** the longest a retry may wait before attempt `n` (0-based) */
function upperDelay(n: number): number {
    const base = Math.min(WHATSAPP_RECONNECT.maxMs, WHATSAPP_RECONNECT.initialMs * WHATSAPP_RECONNECT.factor ** n);

    return Math.ceil(Math.min(WHATSAPP_RECONNECT.maxMs, base * (1 + WHATSAPP_RECONNECT.jitter)));
}

function codesOf(errors: unknown[]): unknown[] {
    return errors.map((error) => (error as { code?: unknown }).code);
}

type StoreWorld = WhatsAppFixture & {
    statuses: WhatsAppConnectionStatus[];
    connections: IStore;
    /** another process's provider over the same store (its renewals on `clock`) */
    other(clock?: ControllableClock): IWhatsAppAuthProvider;
};

/** the fixture over the store provider; `holderClock` drives the fixture provider's renewals (default the fixture's) */
function storeWorld(input: {
    holderClock?: ControllableClock;
    patch?: Partial<WhatsAppChatOptions>;
    /** the fixture provider's keyring (default the shared one) */
    keyring?: IKeyring;
    clock?: ControllableClock;
    store?: IStore;
} = {}): StoreWorld {
    const clock = input.clock ?? new ControllableClock(new Date('2026-11-01T09:00:00Z'));
    const connections = input.store ?? createMemoryStore({ clock });
    const statuses: WhatsAppConnectionStatus[] = [];
    const provider = (owner: string, renewClock: ControllableClock, ring: IKeyring = keyring) => createStoreWhatsAppAuth({
        vault: createConnectionVault({
            store: connections,
            keyring: ring,
            clock: renewClock,
        }),
        connection: 'bot',
        owner,
        leaseTtlMs: TTL,
    });
    const fixture = createWhatsAppFixture({
        patch: {
            auth: provider('connector', input.holderClock ?? clock, input.keyring),
            clock,
            onStatus: (status) => {
                statuses.push(status);
            },
            ...input.patch,
        },
    });

    engines.push(fixture.engine);

    return {
        ...fixture,
        clock,
        statuses,
        connections,
        other: (renewClock = clock) => provider('other', renewClock),
    };
}

/** Makes the next entry write of the store fail once (a short store outage). */
function failNextWrite(store: IStore): void {
    const connections = store.connections!;
    const original = connections.writeEntries.bind(connections);

    connections.writeEntries = async () => {
        connections.writeEntries = original;

        throw new Error('transient store error');
    };
}

/** Holds the next entry write of the store until the returned promise resolves. */
function holdNextWrite(store: IStore): PromiseWithResolvers<void> {
    const connections = store.connections!;
    const original = connections.writeEntries.bind(connections);
    const gate = deferred();

    connections.writeEntries = async (...args) => {
        connections.writeEntries = original;
        await gate.promise;

        return original(...args);
    };

    return gate;
}

async function hold(provider: IWhatsAppAuthProvider): Promise<WhatsAppAuthLease> {
    const lease = await provider.acquire(new AbortController().signal);

    leases.push(lease);

    return lease;
}

/** Everything an error says, its causes included. */
function textOf(error: unknown, depth = 0): string {
    if (depth > 5 || error === undefined || error === null) {
        return '';
    }

    const record = error as {
        message?: unknown; 
        cause?: unknown; 
        stack?: unknown 
    };

    return [
        String(error),
        typeof record.message === 'string' ? record.message : '',
        typeof record.stack === 'string' ? record.stack : '',
        JSON.stringify(error) ?? '',
        textOf(record.cause, depth + 1),
    ].join('\n');
}

describe('WhatsApp connection: held elsewhere, reset, status', () => {
    it('starts while the session is held elsewhere and connects once the holder releases', async () => {
        const world = storeWorld();
        const holder = await hold(world.other());

        await world.engine.start();

        expect(world.setup.status()).toBe('held-elsewhere');
        expect(world.sockets.sockets).toEqual([]);
        expect(world.statuses).toEqual(['connecting', 'held-elsewhere']);

        // still held: the retry finds it held again
        world.clock.advance(upperDelay(0));
        await settle();
        expect(world.sockets.sockets).toEqual([]);
        expect(world.setup.status()).toBe('held-elsewhere');

        await holder.release();
        world.clock.advance(upperDelay(1));
        await settle();

        expect(world.sockets.sockets).toHaveLength(1);
        expect(world.setup.status()).toBe('connecting');
        world.sockets.last().open();
        expect(world.setup.status()).toBe('connected');
        // reported once, not per retry
        expect(codesOf(world.errors)).toEqual([WHATSAPP_AUTH_ERROR_CODE]);
    });

    it('retries a held session without an attempt cap, and a stop ends the retries', async () => {
        const clock = new ControllableClock();
        let attempts = 0;
        const fixture = createWhatsAppFixture({
            patch: {
                clock,
                auth: {
                    acquire: async () => {
                        attempts += 1;

                        throw new ConnectionHeldError('bot');
                    },
                },
            },
        });

        engines.push(fixture.engine);
        await fixture.engine.start();

        for (let n = 0; n < WHATSAPP_RECONNECT.maxAttempts + 5; n++) {
            clock.advance(upperDelay(n));
            await settle();
        }

        expect(attempts).toBe(WHATSAPP_RECONNECT.maxAttempts + 6);
        expect(fixture.setup.status()).toBe('held-elsewhere');
        expect(codesOf(fixture.errors)).toEqual([WHATSAPP_AUTH_ERROR_CODE]);

        await fixture.engine.stop();
        clock.advance(10 * WHATSAPP_RECONNECT.maxMs);
        await settle();

        expect(attempts).toBe(WHATSAPP_RECONNECT.maxAttempts + 6);
        expect(fixture.setup.status()).toBe('stopped');
    });

    it('a failed acquire sets failed and retries until the attempts run out', async () => {
        const clock = new ControllableClock();
        let attempts = 0;
        const fixture = createWhatsAppFixture({
            patch: {
                clock,
                auth: {
                    acquire: async () => {
                        attempts += 1;

                        throw new Error('the store is down');
                    },
                },
            },
        });

        engines.push(fixture.engine);
        await fixture.engine.start();

        expect(fixture.setup.status()).toBe('failed');

        for (let n = 0; n < WHATSAPP_RECONNECT.maxAttempts + 3; n++) {
            clock.advance(upperDelay(n));
            await settle();
        }

        expect(attempts).toBe(WHATSAPP_RECONNECT.maxAttempts + 1);
        expect(fixture.setup.status()).toBe('failed');
        expect(codesOf(fixture.errors)).toEqual([
            ...Array.from({ length: WHATSAPP_RECONNECT.maxAttempts + 1 }, () => WHATSAPP_AUTH_ERROR_CODE),
            WHATSAPP_CONNECTION_ERROR_CODE,
        ]);
    });

    it('logged out, then reset: the session is cleared and a new QR arrives through onPairing', async () => {
        const world = storeWorld();

        await world.engine.start();

        const first = world.sockets.last();

        first.config.auth.creds.registered = true;
        first.emit('creds.update', { registered: true });
        await first.config.auth.keys.set({ session: { 'alice.0': new Uint8Array([1]) } });
        first.open();
        first.close(DisconnectReason.loggedOut);
        expect(world.setup.status()).toBe('logged-out');

        await world.setup.reset();

        expect(world.sockets.sockets).toHaveLength(2);

        const second = world.sockets.last();

        // fresh creds, no keys: a new pairing
        expect(second.config.auth.creds.registered).toBe(false);
        expect(second.config.auth.creds.noiseKey.private).not.toEqual(first.config.auth.creds.noiseKey.private);
        expect(await second.config.auth.keys.get('session', ['alice.0'])).toEqual({});
        expect(await world.connections.connections!.findEntry('bot', 'key:session:alice.0')).toBeUndefined();

        second.emit('connection.update', { qr: QR });
        expect(world.pairings).toEqual([{ qr: QR }]);
        expect(world.setup.status()).toBe('pairing');

        // the fresh creds are what a restart loads
        await world.engine.stop();

        const lease = await hold(world.other());

        expect(lease.auth.creds.registered).toBe(false);
        expect(lease.auth.creds.noiseKey.private).toEqual(second.config.auth.creds.noiseKey.private);
    });

    it('a reset while held elsewhere is refused and queues nothing', async () => {
        const world = storeWorld();
        const holder = await hold(world.other());

        await holder.auth.keys.set({ session: { 'alice.0': new Uint8Array([1]) } });
        await holder.saveCreds();
        await world.engine.start();
        expect(world.setup.status()).toBe('held-elsewhere');

        await expect(world.setup.reset()).rejects.toThrow(/held by another process/);

        expect(world.setup.status()).toBe('held-elsewhere');
        expect(await world.connections.connections!.findEntry('bot', 'creds')).toBeInstanceOf(Uint8Array);

        await holder.release();
        world.clock.advance(upperDelay(0));
        await settle();

        // the session the holder left is the one this process connects with
        expect(world.sockets.sockets).toHaveLength(1);
        expect(await world.sockets.last().config.auth.keys.get('session', ['alice.0'])).toEqual({ 'alice.0': Buffer.from([1]) });
        expect(world.sockets.last().config.auth.creds.signedIdentityKey.public)
            .toEqual(holder.auth.creds.signedIdentityKey.public);
    });

    it('a reset whose acquire finds the session held is refused and clears nothing later', async () => {
        const world = storeWorld();
        const { locks } = world.connections;
        const acquire = locks.acquire.bind(locks);

        locks.acquire = async () => {
            locks.acquire = acquire;

            throw new Error('the store is down');
        };

        await world.engine.start();
        expect(world.setup.status()).toBe('failed');

        const holder = await hold(world.other());

        await holder.auth.keys.set({ session: { 'alice.0': new Uint8Array([1]) } });
        await expect(world.setup.reset()).rejects.toThrow(/held by another process/);
        expect(world.setup.status()).toBe('held-elsewhere');

        await holder.release();

        for (let n = 0; n < 3 && world.sockets.sockets.length === 0; n++) {
            world.clock.advance(upperDelay(n));
            await settle();
        }

        expect(world.sockets.sockets).toHaveLength(1);
        expect(await world.sockets.last().config.auth.keys.get('session', ['alice.0'])).toEqual({ 'alice.0': Buffer.from([1]) });
    });

    it('a reset while connected ends the socket, releases, clears and pairs again', async () => {
        const world = storeWorld();

        await world.engine.start();

        const first = world.sockets.last();

        await first.config.auth.keys.set({ session: { 'alice.0': new Uint8Array([1]) } });
        first.open();
        expect(world.setup.status()).toBe('connected');

        await world.setup.reset();

        expect(first.ended).toBe(1);
        expect(first.listenerCount()).toBe(0);
        expect(world.sockets.sockets).toHaveLength(2);
        expect(await world.sockets.last().config.auth.keys.get('session', ['alice.0'])).toEqual({});
        // the old socket's late events change nothing
        first.open();
        expect(world.setup.status()).toBe('connecting');
        await expect(Promise.resolve(first.config.auth.keys.set({ session: { b: new Uint8Array([2]) } })))
            .rejects.toBeInstanceOf(InvalidRunStateError);
    });

    it('a reset recovers a session whose data key no keyring key unwraps', async () => {
        const clock = new ControllableClock(new Date('2026-11-01T09:00:00Z'));
        const store = createMemoryStore({ clock });
        const before = storeWorld({ clock, store });

        await before.engine.start();
        await before.sockets.last().config.auth.keys.set({ session: { 'alice.0': new Uint8Array([1]) } });
        await before.engine.stop();

        // the old master key is gone from the keyring
        const world = storeWorld({
            clock,
            store,
            keyring: createKeyring([{ id: 'k2', key: randomBytes(32) }]),
        });

        await world.engine.start();
        expect(world.setup.status()).toBe('failed');
        expect(world.sockets.sockets).toEqual([]);

        await world.setup.reset();

        expect(world.sockets.sockets).toHaveLength(1);
        expect(world.setup.status()).toBe('connecting');
        expect((await store.connections!.findOneOrFail('bot')).keyId).toBe('k2');
        expect(await store.connections!.findEntry('bot', 'key:session:alice.0')).toBeUndefined();
        expect(await store.connections!.findEntry('bot', 'creds')).toBeInstanceOf(Uint8Array);
        expect(await world.sockets.last().config.auth.keys.get('session', ['alice.0'])).toEqual({});
    });

    it('a reset of a connection that is not started is refused', async () => {
        const world = storeWorld();

        await expect(world.setup.reset()).rejects.toBeInstanceOf(InvalidRunStateError);
    });

    it('a lost lease ends the socket and waits for the session like a start', async () => {
        // the connector's renewals never run: its lease expires on the store's clock
        const world = storeWorld({ holderClock: new ControllableClock() });

        await world.engine.start();
        world.sockets.last().open();

        world.clock.advance(TTL);

        const takeover = await hold(world.other());

        // the next write is fenced out, which tells the connector
        world.sockets.last().emit('creds.update', {});
        await settle();

        expect(world.sockets.last().ended).toBe(1);
        expect(world.setup.status()).toBe('held-elsewhere');
        expect(codesOf(world.errors)).toContain(WHATSAPP_AUTH_ERROR_CODE);

        await takeover.release();
        world.clock.advance(upperDelay(0));
        await settle();

        expect(world.sockets.sockets).toHaveLength(2);
        expect(world.setup.status()).toBe('connecting');
    });

    it('pairing while a QR is outstanding, connected once the phone scanned it', async () => {
        const world = storeWorld();

        await world.engine.start();

        const socket = world.sockets.last();

        socket.emit('connection.update', { connection: 'connecting' });
        socket.emit('connection.update', { qr: QR });
        expect(world.setup.status()).toBe('pairing');
        socket.emit('connection.update', { qr: `${QR}-2` });
        expect(world.setup.status()).toBe('pairing');
        socket.open();
        expect(world.setup.status()).toBe('connected');
        await world.engine.stop();

        // one call per change, in order, no pairing material
        expect(world.statuses).toEqual(['connecting', 'pairing', 'connected', 'stopped']);
    });

    it('never hands the QR to onError, on any path', async () => {
        const world = storeWorld({
            patch: {
                onPairing: () => {
                    throw new Error(`could not render ${QR}`);
                },
                onStatus: () => {
                    throw new Error('status listener failed');
                },
            },
        });

        await world.engine.start();

        const socket = world.sockets.last();

        socket.emit('connection.update', { qr: QR });
        socket.close(DisconnectReason.loggedOut);
        await world.setup.reset();
        world.sockets.last().emit('connection.update', { qr: QR });
        world.sockets.last().close(DisconnectReason.connectionReplaced);
        await world.engine.stop();

        expect(world.errors.length).toBeGreaterThan(0);

        for (const error of world.errors) {
            expect(textOf(error)).not.toContain('SECRET-PAIRING-REFERENCE');
        }
    });
});

describe('WhatsApp connection: closing a generation always ends its session', () => {
    it('a reset after an earlier failed write releases the lease and connects again', async () => {
        const world = storeWorld();

        await world.engine.start();
        world.sockets.last().open();
        failNextWrite(world.connections);
        await expect(Promise.resolve(world.sockets.last().config.auth.keys.set({ session: { a: new Uint8Array([1]) } })))
            .rejects.toThrow('transient store error');
        await world.sockets.last().config.auth.keys.set({ session: { b: new Uint8Array([2]) } });

        await world.setup.reset();
        await settle();

        expect(world.sockets.sockets).toHaveLength(2);
        expect(world.setup.status()).toBe('connecting');
        world.sockets.last().open();
        expect(world.setup.status()).toBe('connected');

        // the flush failure is reported, the lease was not kept for it
        expect(world.errors.some((error) => textOf(error).includes('transient store error'))).toBe(true);

        // the new session renews: nothing holds it elsewhere, nothing retries
        for (let ms = 0; ms < 10 * TTL; ms += 500) {
            world.clock.advance(500);
            await settle();
        }

        expect(world.setup.status()).toBe('connected');
        expect(world.sockets.sockets).toHaveLength(2);
    });

    it('a stop after an earlier failed write releases the lease at once', async () => {
        const world = storeWorld();

        await world.engine.start();
        failNextWrite(world.connections);
        await expect(Promise.resolve(world.sockets.last().config.auth.keys.set({ session: { a: new Uint8Array([1]) } })))
            .rejects.toThrow('transient store error');
        await world.engine.stop();

        await expect(hold(world.other())).resolves.toBeDefined();
    });

    it('writes past the settling bound: the lease is released once they finish', async () => {
        const world = storeWorld();

        await world.engine.start();

        const gate = holdNextWrite(world.connections);
        const pending = world.sockets.last().config.auth.keys.set({ session: { a: new Uint8Array([1]) } });
        const stopping = world.engine.stop();

        // in steps: the session renews meanwhile, its lease never runs out
        for (let ms = 0; ms < WHATSAPP_SHUTDOWN_TIMEOUT_MS; ms += 500) {
            await settle();
            world.clock.advance(500);
        }

        await stopping;

        expect(codesOf(world.errors)).toContain(WHATSAPP_AUTH_ERROR_CODE);
        await expect(hold(world.other())).rejects.toBeInstanceOf(ConnectionHeldError);

        gate.resolve();
        await pending;
        await settle();

        await expect(hold(world.other())).resolves.toBeDefined();
    });

    it('a reset right after a lost lease is refused; the lost close leaves one retry and no orphaned socket', async () => {
        // the connector's renewals never run: its lease expires on the store's clock
        const world = storeWorld({ holderClock: new ControllableClock() });

        await world.engine.start();
        world.sockets.last().open();
        world.clock.advance(TTL);

        const takeover = await hold(world.other());

        world.sockets.last().emit('creds.update', {});

        for (let i = 0; i < 50 && world.setup.status() !== 'held-elsewhere'; i++) {
            await Promise.resolve();
        }

        expect(world.setup.status()).toBe('held-elsewhere');
        await takeover.release();
        await expect(world.setup.reset()).rejects.toThrow(/held by another process/);
        await settle();
        world.clock.advance(upperDelay(0));
        await settle();

        expect(world.sockets.sockets).toHaveLength(2);
        world.sockets.last().open();
        expect(world.setup.status()).toBe('connected');

        for (let k = 1; k < 5; k++) {
            world.clock.advance(upperDelay(k));
            await settle();
        }

        expect(world.setup.status()).toBe('connected');
        expect(world.sockets.sockets).toHaveLength(2);
        expect(world.sockets.last().ended).toBe(0);
    });
});

describe('WhatsApp connection: the retry budget of a reset, a reentrant close', () => {
    it('refuses a reset the provider does not support and leaves the session serving', async () => {
        const auth = createRecordingAuth();
        const world = createWhatsAppFixture({ patch: { auth: { acquire: (signal) => auth.provider.acquire(signal) } } });

        engines.push(world.engine);
        await world.engine.start();
        world.sockets.last().open();

        await expect(world.setup.reset()).rejects.toThrow(/does not support a reset/);

        expect(world.setup.status()).toBe('connected');
        expect(world.sockets.sockets).toHaveLength(1);
        expect(world.sockets.last().ended).toBe(0);
        expect(auth.trace).not.toContain('release');
    });

    it('a lease lost during a reset that outlasts its close still retries, without the reset', async () => {
        const auth = createRecordingAuth();
        const lost = deferred();
        const resets: (boolean | undefined)[] = [];
        const provider: IWhatsAppAuthProvider = {
            supportsReset: true,
            async acquire(signal, options) {
                resets.push(options?.reset);

                const lease = await auth.provider.acquire(signal, options);

                return resets.length === 2 ? { ...lease, lost: lost.promise } : lease;
            },
        };
        const world = createWhatsAppFixture({ patch: { auth: provider } });

        engines.push(world.engine);
        await world.engine.start();

        const save = auth.holdCreds();
        const outcome = expect(world.setup.reset()).rejects.toThrow(/held by another process/);

        await settle();
        lost.resolve();
        await settle();
        expect(world.setup.status()).toBe('held-elsewhere');

        // the close gives up on the pending save at its bound, while the reset still runs
        world.clock.advance(WHATSAPP_SHUTDOWN_TIMEOUT_MS);
        await settle();
        save.resolve();
        await outcome;
        await settle();

        world.clock.advance(upperDelay(0));
        await settle();

        expect(resets).toEqual([false, true, false]);
        expect(world.sockets.sockets).toHaveLength(2);
    });

    it('keeps the retry budget while saving the fresh creds keeps failing', async () => {
        const auth = createRecordingAuth();
        const provider: IWhatsAppAuthProvider = {
            supportsReset: true,
            async acquire(signal, options) {
                const lease = await auth.provider.acquire(signal, options);

                return {
                    ...lease,
                    saveCreds: () => Promise.reject(new Error('save failed')),
                };
            },
        };
        const world = createWhatsAppFixture({ patch: { auth: provider } });

        engines.push(world.engine);
        await world.engine.start();
        await world.setup.reset();

        const acquires = () => auth.trace.filter((entry) => entry === 'acquire').length;

        for (let n = 0; n <= WHATSAPP_RECONNECT.maxAttempts + 2; n++) {
            world.clock.advance(upperDelay(n));
            await settle();
        }

        // the connect, the reset's own, then one per attempt of the budget
        expect(acquires()).toBe(2 + WHATSAPP_RECONNECT.maxAttempts);
        expect(world.errors.filter((error) => (error as Error).message.includes('times in a row'))).toHaveLength(1);
    });

    it('builds no lease and no socket after an onStatus closed the connection', async () => {
        const auth = createRecordingAuth();
        const sockets = createFakeSockets();
        const connection = createWhatsAppConnection({
            auth: auth.provider,
            socketFactory: sockets.factory,
            onPairing: () => undefined,
            onError: () => undefined,
            onMessages: () => undefined,
            onStatus: (status) => {
                if (status === 'connecting') {
                    void connection.close();
                }
            },
        });

        await expect(connection.connect({
            signal: new AbortController().signal,
            clock: new ControllableClock(new Date('2026-11-01T09:00:00Z')),
        })).rejects.toBeInstanceOf(InvalidRunStateError);

        expect(auth.signals).toEqual([]);
        expect(sockets.sockets).toEqual([]);
    });

    function storeAuth(keys: IKeyring, store: IStore, clock: ControllableClock): IWhatsAppAuthProvider {
        return createStoreWhatsAppAuth({
            vault: createConnectionVault({
                store, 
                keyring: keys, 
                clock, 
            }),
            connection: 'bot',
            owner: 'connector',
            leaseTtlMs: TTL,
        });
    }

    it('releases the lease after a flush that failed, so the reset takes it again', async () => {
        const clock = new ControllableClock(new Date('2026-11-01T09:00:00Z'));
        const inner = storeAuth(keyring, createMemoryStore({ clock }), clock);
        let failFlush = true;
        const provider: IWhatsAppAuthProvider = {
            supportsReset: true,
            async acquire(signal, options) {
                const lease = await inner.acquire(signal, options);

                return {
                    ...lease,
                    flush() {
                        if (failFlush) {
                            failFlush = false;

                            return Promise.reject(new Error('flush failed'));
                        }

                        return lease.flush();
                    },
                };
            },
        };
        const statuses: WhatsAppConnectionStatus[] = [];
        const world = createWhatsAppFixture({
            patch: {
                auth: provider,
                onStatus: (status) => {
                    statuses.push(status);
                },
            },
        });

        engines.push(world.engine);
        await world.engine.start();
        await world.setup.reset();

        expect(statuses).not.toContain('held-elsewhere');
        expect(world.sockets.sockets).toHaveLength(2);
        expect(world.errors.map((error) => (error as Error).message).join()).toContain('Flushing the WhatsApp auth lease failed');
    });

    it('a reset recovers a session whose data key no keyring key unwraps', async () => {
        const clock = new ControllableClock(new Date('2026-11-01T09:00:00Z'));
        const store = createMemoryStore({ clock });
        const previous = await storeAuth(keyring, store, clock).acquire(new AbortController().signal);

        await previous.release();

        const world = createWhatsAppFixture({ patch: { auth: storeAuth(createKeyring([{ id: 'k2', key: randomBytes(32) }]), store, clock) } });

        engines.push(world.engine);
        await world.engine.start();
        expect(world.sockets.sockets).toEqual([]);

        await world.setup.reset();

        expect(world.sockets.sockets).toHaveLength(1);
        expect(await store.connections!.findOne('bot')).toMatchObject({ keyId: 'k2' });
    });

    it('a reset recovers a session whose creds do not decode', async () => {
        const clock = new ControllableClock(new Date('2026-11-01T09:00:00Z'));
        const store = createMemoryStore({ clock });
        const session = await createConnectionVault({
            store, 
            keyring, 
            clock, 
        }).open('bot', { type: 'whatsapp', owner: 'seed' });

        await session.write({ set: { creds: new TextEncoder().encode('not json') } });
        await session.close();

        const world = createWhatsAppFixture({ patch: { auth: storeAuth(keyring, store, clock) } });

        engines.push(world.engine);
        await world.engine.start();
        expect(world.sockets.sockets).toEqual([]);

        await world.setup.reset();

        expect(world.sockets.sockets).toHaveLength(1);
    });
});
