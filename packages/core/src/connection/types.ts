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

/** A connection's plain settings and its sealed secrets, as the repository stores them. */
export type ConnectionConfig = {
    /** The data key the secrets are sealed under, read in the same snapshot as them. */
    keyId: string;
    wrappedKey: Uint8Array;
    settings: Record<string, unknown>;
    /** Sealed bytes by field name; the repository never sees plaintext. */
    secrets: Map<string, Uint8Array>;
    /** Bumped by every `writeConfig`, starting at 0. */
    revision: number;
};

/**
 * One atomic config change: `settings` replaces the stored settings as a whole
 * (absent keeps them), then `setSecrets` writes, then `clearSecrets` removes
 * (a field in both ends cleared).
 */
export type ConnectionConfigWrite = {
    settings?: Record<string, unknown>;
    setSecrets?: Record<string, Uint8Array>;
    clearSecrets?: readonly string[];
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

export type ConnectionOpenOptionsInput = {
    /** The provider's type; an existing connection of another type is refused. */
    type: string;
    /** The process's owner (e.g. `${hostname}-${pid}`); each session leases as `<owner>:<random uuid>`. */
    owner: string;
    /** Default DEFAULT_CONNECTION_LEASE_TTL_MS, 3 to 2_147_483_647 (the timer limit); renewed every `leaseTtlMs / 3`. */
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

/** The checked open options (see ConnectionOpenOptionsInput), the lease ttl resolved. */
export type ConnectionOpenOptions = {
    type: string;
    owner: string;
    leaseTtlMs: number;
    signal?: AbortSignal;
    recreate?: boolean;
};

/**
 * The one place combining the connection repository, the lease and sealing:
 * providers (WhatsApp, later Telegram) open sessions through it.
 */
export interface IConnectionVault {
    /**
     * Acquires the lease `connection:<name>`, creates the connection with a
     * fresh data key when absent, renews the lease once (the initialization
     * may outlast it), unwraps its data key and starts renewing. Rejects
     * with ConnectionHeldError while the lease is held, with LeaseLostError
     * when the lease lapsed before open could confirm it, with
     * InvalidAgentDefinitionError on a type mismatch, with
     * DecryptionFailedError when the keyring cannot unwrap the data key
     * (`recreate` replaces the connection instead); the lease is released on
     * every failure.
     */
    open(name: string, opts: ConnectionOpenOptionsInput): Promise<IConnectionSession>;
}

/**
 * An exclusive, renewed hold of one connection. Entries are sealed with the
 * connection's data key (a private field, never serialized), bound to
 * `<name>\0<key>`. Writes are serialized
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
    /**
     * Resolves once, when a renew or a fenced write found the lease gone, or
     * when no renewal was confirmed before the last confirmed expiry (a renew
     * that keeps throwing or never settles); never rejects.
     */
    readonly lost: Promise<LeaseLostError>;
    /**
     * Refuses new calls, keeps renewing until the accepted writes settled,
     * then stops renewing, zeroes the data key and releases the lease.
     * Idempotent, never rejects.
     */
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
    /**
     * Clears the connection's session and starts it again (e.g. a new
     * pairing); rejects, clearing nothing, while the status is `held_elsewhere`.
     */
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

export type ConnectionFieldKind = 'string' | 'number' | 'boolean' | 'select' | 'list' | 'secret';

export type ConnectionValue = string | number | boolean | readonly string[];

export type ConnectionValues = Record<string, ConnectionValue>;

/** One setting of a connection type: enough to render its form and find its variable. */
export type ConnectionField = {
    key: string;
    label: string;
    kind: ConnectionFieldKind;
    required?: boolean;
    description?: string;
    /** The choices of a `select` field. */
    options?: readonly string[];
    /** The variable this field reads for a connection; undefined when it has none. */
    env?: (connection: string) => string | undefined;
};

/** The public contract of a configurable connection type, first or third party. */
export type ConnectionTypeDefinition = {
    type: string;
    label: string;
    /** Whether the type allows several accounts ("Add account"). */
    multiple: boolean;
    fields: readonly ConnectionField[];
    /** The duplicate guard of a multi-instance type (one mail address cannot be added twice). */
    uniqueId?: (values: ConnectionValues) => string;
    /** Checks saved values, never unsaved form input. */
    test?: (values: ConnectionValues, signal: AbortSignal) => Promise<void>;
};

/** Where a field's value came from. */
export type ConnectionFieldSource = { kind: 'env'; variable: string } |
    { kind: 'store' } |
    { kind: 'code' } |
    { kind: 'unset' };

/** `incomplete`: some field is set but a required one is not, only reachable without an env field. */
export type ConnectionState = 'configured' | 'not_configured' | 'incomplete';

export type ResolvedConnection = {
    name: string;
    values: ConnectionValues;
    sources: Record<string, ConnectionFieldSource>;
    /** The keys of the required fields without a value. */
    missing: string[];
    state: ConnectionState;
};

/** One connection a module declares, resolved for the API. */
export type DeclaredConnection = {
    name: string;
    /** The account id tools, variables and the UI show, for a multi-instance type. */
    account?: string;
    editable: boolean;
    deletable: boolean;
    resolved: ResolvedConnection;
    /** The stored revision this process loaded; a newer one means "restart to apply". */
    loadedRevision?: number;
};

/** What a package registers for each connection type it configures. */
export interface IConnectionTypeProvider {
    readonly definition: ConnectionTypeDefinition;
    /** Whether the dashboard may create accounts of this type. */
    creatable(): boolean;
    connections(): readonly DeclaredConnection[];
}

export type ResolveConnectionInput = {
    definition: ConnectionTypeDefinition;
    name: string;
    readVariable: (variable: string) => string | undefined;
    stored?: ConnectionValues;
    /** Values from code or a JSON variable, which win over everything. */
    preset?: Record<string, { value: ConnectionValue; source: ConnectionFieldSource }>;
};
