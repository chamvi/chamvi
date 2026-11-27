/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IConnectionRepository } from '@chamvi/store';
import type {
    Connection,
    ConnectionFieldKind,
    ConnectionFieldSource,
    ConnectionInput,
    ConnectionState,
    ConnectionStatus,
    ConnectionWidget,
} from '@chamvi/core-kit';
import type { IClock } from '../clock/types.ts';
import type { LeaseLostError } from '../errors/index.ts';
import type { IKeyring } from '../keyring/types.ts';
import type { ILockService } from '../lock/types.ts';

/**
 * One atomic batch of entry changes: `clear` removes every entry, then `set`
 * writes, then `delete` removes (a key in both `set` and `delete` ends deleted).
 */
export type ConnectionEntryWrite = {
    set?: Record<string, Uint8Array>;
    delete?: readonly string[];
    clear?: boolean;
};

/** A connection's plain settings and its sealed secrets, as the service reads them. */
export type ConnectionConfig = {
    /** The data key the secrets are sealed under, read in the same snapshot as them. */
    keyId: string;
    wrappedKey: Uint8Array;
    settings: Record<string, unknown>;
    /** Sealed bytes by field name; the store never sees plaintext. */
    secrets: Map<string, Uint8Array>;
    /** Bumped by every `writeConfig` and `replace`, starting at 0. */
    revision: number;
    /** The row's id: another one means the connection was deleted and created again. */
    generation: string;
};

/**
 * What a config write expects to find under the connection row's lock:
 * the data key it sealed under and, when given, the revision and the
 * generation its checks read.
 */
export type ConnectionWriteExpectation = {
    wrappedKey: Uint8Array;
    revision?: number;
    generation?: string;
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

/** The lease (`LockService`) a write must hold at write time. */
export type ConnectionFence = {
    lock: string;
    owner: string;
};

export type ConnectionServiceContext = {
    /** The connections with their entries and secrets, and the fence read of their leases. */
    repository: IConnectionRepository;
    /** Read after the locked reads: the fence's expiry is compared with it, `updatedAt` stamped from it. */
    clock: IClock;
};

export type ConnectionVaultOptions = {
    /** The stored connections; the leases of `lockService` fence its writes. */
    connectionService: Pick<IConnectionService, 'create' | 'findOne' | 'findOneOrFail' | 'replace' | 'findEntries' | 'writeEntries'>;
    /**
     * The connection leases (`connection:<name>`), in the lock storage the
     * connection repository's fence reads (the same database, or the same
     * memory registry).
     */
    lockService: Pick<ILockService, 'acquire' | 'renew' | 'release'>;
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

export type ConnectionConfigStoreOptions = {
    /** The stored connections; the leases of `lockService` guard `delete`. */
    connectionService: Pick<IConnectionService, 'create' | 'findOne' | 'findOneOrFail' | 'findConfig' | 'writeConfig' | 'delete'>;
    /**
     * The connection leases (`connection:<name>`), in the lock storage the
     * connection repository's fence reads (the same database, or the same
     * memory registry).
     */
    lockService: Pick<ILockService, 'acquire' | 'release'>;
    /** Resolved only when a data key is needed: an app without keys can still describe and read secret-free connections. */
    keyring: () => IKeyring;
    /** Stamps created rows (default systemClock). */
    clock?: IClock;
};

/** What an API may show of a connection's config: secrets by name only. */
export type ConnectionConfigView = {
    settings: Record<string, unknown>;
    /** The names of the stored secrets, sorted; never their values. */
    secretsSet: string[];
    revision: number;
    /** The row's id: another one means the connection was deleted and created again. */
    generation: string;
};

/** One config save: `settings` replaces the stored settings as a whole (absent keeps them). */
export type ConnectionConfigUpdate = {
    settings?: Record<string, unknown>;
    secrets?: {
        set?: Record<string, string>;
        clear?: readonly string[];
    };
};

export type ConnectionConfigUpdateOptions = {
    /** The revision the caller's checks read; another save since then refuses the write. */
    revision?: number;
    /** The generation the caller's checks read; a delete and create since then refuses the write. */
    generation?: string;
};

/**
 * Settings and sealed secrets of a connection, written from any replica
 * without the provider's lease: a running session's entries and data key
 * stay untouched. Secrets are sealed with the connection's data key, bound to
 * `<name>\0secret\0<field>`.
 */
export interface IConnectionConfigStore {
    /**
     * Creates the row with a fresh wrapped data key, then saves `update`.
     * Resolves false, changing nothing, when the name is taken; rejects with
     * ConnectionChangedError, keeping the row, when another writer saved its
     * config between the row and this save. A save that fails otherwise
     * leaves the row without config (revision 0): an `update` expecting
     * revision 0 fills it.
     */
    create(name: string, type: string, update: ConnectionConfigUpdate): Promise<boolean>;
    /** Never resolves the keyring. */
    describe(name: string): Promise<ConnectionConfigView | undefined>;
    /** The settings and decrypted secrets; resolves the keyring only when secrets exist. */
    read(name: string): Promise<{
        values: ConnectionValues;
        revision: number;
        generation: string
    } | undefined>;
    /**
     * Saves `update` and returns the new revision; resolves the keyring only
     * to set a secret. RepositoryNotFoundError when absent,
     * ConnectionChangedError when a recreate replaced the data key meanwhile,
     * or when `options.revision` is no longer the stored one (nothing is
     * written).
     */
    update(name: string, update: ConnectionConfigUpdate, options?: ConnectionConfigUpdateOptions): Promise<number>;
    /** Removes the connection under a one-shot lease; ConnectionHeldError while the lease is held. */
    delete(name: string, owner: string): Promise<void>;
}



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
    /** A `string` or `secret` whose value has line breaks (a PEM): a single-line input would strip them. */
    multiline?: boolean;
    /** Decides where a secret is sent (a host, a URL): changing it needs every secret of the connection again. */
    bindsSecrets?: boolean;
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



export type ResolvedConnection = {
    name: string;
    values: ConnectionValues;
    sources: Record<string, ConnectionFieldSource>;
    /** The keys of the required fields without a value. */
    missing: string[];
    state: ConnectionState;
    /** Why a start could not use it: names options or variables, never a value. */
    reason?: string;
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
    /** The row's generation (its id) this process loaded; another one means the account was deleted and created again. */
    loadedGeneration?: string;
    /**
     * This connection's test, when it differs from its type's (one provider
     * serves modules with their own endpoint or fetch); else the type's.
     */
    test?: ConnectionTypeDefinition['test'];
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

/**
 * The operations of `ConnectionService`. Anything that satisfies it can stand in
 * for the service: the engine, the channels and the HTTP API take this type.
 */
export interface IConnectionService {
    /** Insert-if-absent: resolves false and keeps the stored connection when the name is taken. */
    create(connection: ConnectionInput): Promise<boolean>;

    findOne(name: string): Promise<Connection | undefined>;

    /** As `findOne`; RepositoryNotFoundError when absent. */
    findOneOrFail(name: string): Promise<Connection>;

    /** Every connection, ordered by name in code-point order. */
    find(): Promise<Connection[]>;

    /**
     * Removes the connection with its entries and config; a missing name is a
     * no-op. With `fence`, the fence holds at write time or LeaseLostError and
     * nothing is deleted.
     */
    delete(name: string, fence?: ConnectionFence): Promise<void>;

    /**
     * All or nothing: swaps the connection of `connection.name` for
     * `connection` (inserts it if absent), dropping its entries and secrets
     * (they are sealed under the replaced data key), keeping its id,
     * `createdAt` and settings and bumping its config revision, so a config
     * write that read before the replace is stale. The replacement is validated as by `create`
     * (ValidationError) before anything else; the fence holds at write time or
     * LeaseLostError and nothing changes.
     */
    replace(connection: ConnectionInput, fence: ConnectionFence): Promise<void>;

    findEntry(name: string, key: string): Promise<Uint8Array | undefined>;

    /** The stored ones of `keys`; missing keys are absent from the map. */
    findEntries(name: string, keys: readonly string[]): Promise<Map<string, Uint8Array>>;

    /**
     * All or nothing: `clear`, then `set`, then `delete`, and `updatedAt`
     * set to now. The fence holds at write time or LeaseLostError and nothing
     * is written.
     */
    writeEntries(name: string, write: ConnectionEntryWrite, fence: ConnectionFence): Promise<void>;

    /**
     * A consistent read of the data key (`keyId`, `wrappedKey`), settings,
     * sealed secrets and revision; undefined when the connection is absent.
     * It takes no lock: the row, then its secrets, then the row again, kept
     * when the row's id, key and revision are unchanged (every config write
     * bumps the revision, a replace swaps the key, a delete and create the
     * id); after CONFIG_READ_ATTEMPTS changed reads, one read
     * under the connection row's lock.
     */
    findConfig(name: string): Promise<ConnectionConfig | undefined>;

    /**
     * Saves the config and returns the new revision (bumped by one, with
     * `updatedAt`). RepositoryNotFoundError when absent; ConnectionChangedError
     * when the stored wrappedKey differs from `expected.wrappedKey`, or the
     * stored revision or id from a given `expected.revision` or
     * `expected.generation` (another save, a replace or a delete and create
     * landed since it was read; nothing is written). Takes no fence: any replica may
     * write while a session holds the lease, and entries and the data key
     * stay untouched.
     */
    writeConfig(
        name: string,
        write: ConnectionConfigWrite,
        expected: ConnectionWriteExpectation,
    ): Promise<number>;
}
