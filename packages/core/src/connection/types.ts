/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '../clock/types.ts';
import type { LeaseLostError } from '../errors/index.ts';
import type { IKeyring } from '../keyring/types.ts';
import type { IStore } from '../repository/types.ts';

/**
 * One configured account of a provider (WhatsApp, later Telegram, Slack). The
 * store holds only its wrapped data key; its entries are sealed bytes.
 */
export type Connection = {
    /** Agent-name rule (`^[a-z0-9]+(-[a-z0-9]+)*$`, at most 64). */
    name: string;
    /** Set by the provider (`whatsapp`), 1 to 64 characters. */
    type: string;
    /** The keyring key the data key is wrapped under. */
    keyId: string;
    wrappedKey: Uint8Array;
    createdAt: Date;
    updatedAt: Date;
};

/**
 * One atomic batch of entry changes: `clear` removes every entry, then `set`
 * writes, then `delete` removes (a key in both `set` and `delete` ends deleted).
 */
export type ConnectionEntryWrite = {
    set?: Record<string, Uint8Array>;
    delete?: readonly string[];
    clear?: boolean;
};

/** The store lock lease (`ILockRepository`) a write must hold at write time. */
export type ConnectionFence = {
    lock: string;
    owner: string;
};

export type ConnectionVaultOptions = {
    /** Must hold `connections`; its `locks` fence the writes. */
    store: IStore;
    keyring: IKeyring;
    /** Drives the lease renewals (default systemClock). */
    clock?: IClock;
};

export type ConnectionOpenOptions = {
    /** The provider's type; an existing connection of another type is refused. */
    type: string;
    /** The lease owner (one per process, e.g. `${hostname}-${pid}`). */
    owner: string;
    /** Default DEFAULT_CONNECTION_LEASE_TTL_MS; renewed every `leaseTtlMs / 3`. */
    leaseTtlMs?: number;
    /** Aborts the open; a lease acquired meanwhile is released. */
    signal?: AbortSignal;
};

/**
 * The one place combining the connection repository, the lease and sealing:
 * providers (WhatsApp, later Telegram) open sessions through it.
 */
export interface IConnectionVault {
    /**
     * Acquires the lease `connection:<name>`, creates the connection with a
     * fresh data key when absent, unwraps its data key and starts renewing.
     * Rejects with ConnectionHeldError while the lease is held, with
     * InvalidAgentDefinitionError on a type mismatch, with
     * DecryptionFailedError when the keyring cannot unwrap the data key; the
     * lease is released on every failure.
     */
    open(name: string, opts: ConnectionOpenOptions): Promise<IConnectionSession>;
}

/**
 * An exclusive, renewed hold of one connection. Entries are sealed with the
 * connection's data key, bound to `<name>\0<key>`. Writes are serialized
 * and fenced by the lease; reads wait for the writes accepted before them.
 * After `lost` every call throws LeaseLostError, after `close` (begun)
 * InvalidRunStateError.
 */
export interface IConnectionSession {
    readonly name: string;
    read(keys: readonly string[]): Promise<Map<string, Uint8Array>>;
    readOne(key: string): Promise<Uint8Array | undefined>;
    /** Resolves when this batch is durable; a malformed batch is refused before it is queued. */
    write(write: ConnectionEntryWrite): Promise<void>;
    /** Resolves when every accepted write is durable; rejects with the first failure since the last flush. */
    flush(): Promise<void>;
    /** Resolves once, when a renew or a fenced write found the lease gone; never rejects. */
    readonly lost: Promise<LeaseLostError>;
    /** Stops renewing, waits for pending writes, releases the lease. Idempotent, never rejects. */
    close(): Promise<void>;
}

/**
 * The live state of a connection as its provider sees it in this process
 * (not stored): `held_elsewhere` while another process holds its lease.
 */
export type ConnectionStatus = 'disconnected' |
    'pairing' |
    'connecting' |
    'connected' |
    'logged_out' |
    'held_elsewhere' |
    'failed';

/**
 * What a connection asks an operator to see, rendered by kind. `qr` is
 * pairing material: secret, shown only to a holder of
 * `connection:<name>:write`, never logged.
 */
export type ConnectionWidget = {
    kind: 'qr';
    value: string;
};

/** The actions a connection offers; each optional. */
export type ConnectionActions = {
    /** Clears the connection's session and starts it again (e.g. a new pairing). */
    reset?(): Promise<void>;
};

/**
 * The runtime view of one connection a provider exposes (the dashboard's
 * shape): process-local status and widgets, a change feed and actions.
 */
export interface IConnectionHandle {
    readonly name: string;
    readonly type: string;
    status(): ConnectionStatus;
    /** The widgets now (a new array); empty when there is nothing to show. */
    widgets(): ConnectionWidget[];
    /** Called after every status or widget change; returns the unsubscribe. */
    subscribe(listener: () => void): () => void;
    readonly actions: ConnectionActions;
}
