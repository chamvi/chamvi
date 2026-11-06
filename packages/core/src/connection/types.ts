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
    /** The process's owner (e.g. `${hostname}-${pid}`); each session leases as `<owner>:<random uuid>`. */
    owner: string;
    /** Default DEFAULT_CONNECTION_LEASE_TTL_MS; renewed every `leaseTtlMs / 3`. */
    leaseTtlMs?: number;
    /** Aborts the open; a lease acquired meanwhile is released. */
    signal?: AbortSignal;
    /**
     * Under the acquired lease, deletes the stored connection (its entries
     * with it) and creates it again with a fresh data key under the active
     * master key: recovers a data key no keyring key unwraps or a type
     * mismatch. Default false.
     */
    recreate?: boolean;
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
     * DecryptionFailedError when the keyring cannot unwrap the data key
     * (`recreate` replaces the connection instead); the lease is released on
     * every failure.
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
