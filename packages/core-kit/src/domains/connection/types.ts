/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/**
 * One configured account of a provider (WhatsApp, later Telegram, Slack). The
 * store holds only its wrapped data key; its entries are sealed bytes.
 */
export type Connection = {
    /**
     * The row's storage id (a uuid v7), set at insert and never changed: the
     * connection's generation. Another id under the same name is another row
     * (deleted and created again), whatever its revision says.
     */
    id: string;
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

/** A connection to store: the service assigns its id. */
export type ConnectionInput = Omit<Connection, 'id'>;

/** The row a connection stores: the connection (its id referenced by its entries and secrets), its plain settings and its config revision. */
export type ConnectionRecord = Connection & {
    /** Plain settings; never secret material. */
    settings: Record<string, unknown>;
    /** The revision of the settings and secrets. */
    configRevision: number;
};

/** One runtime-state entry of a connection: opaque sealed bytes under a key. */
export type ConnectionEntryRecord = {
    /** The row's storage id (a uuid). */
    id: string;
    /** The id of the connection's row. */
    connectionId: string;
    key: string;
    /** Sealed bytes; the repository never sees plaintext. */
    value: Uint8Array;
};

/** One configured secret of a connection: sealed bytes under a field name, never mixed with entries. */
export type ConnectionSecretRecord = {
    /** The row's storage id (a uuid). */
    id: string;
    /** The id of the connection's row. */
    connectionId: string;
    name: string;
    /** Sealed bytes; the repository never sees plaintext. */
    value: Uint8Array;
};

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
 * `chamvi_connection_write` for the connection, never logged.
 */
export type ConnectionWidget = {
    kind: 'qr';
    value: string;
};

export type ConnectionFieldKind = 'string' | 'number' | 'boolean' | 'select' | 'list' | 'secret';

/** Where a field's value came from. */
export type ConnectionFieldSource = { kind: 'env'; variable: string } |
    { kind: 'store' } |
    { kind: 'code' } |
    { kind: 'unset' };

/**
 * `incomplete`: some field is set but a required one is not, only reachable
 * without an env field. `failed`: a stored value it needs cannot be read (an
 * undecryptable row, stored secrets without a keyring); `reason` says why.
 */
export type ConnectionState = 'configured' | 'not_configured' | 'incomplete' | 'failed';

/**
 * One entry of `GET /connections` (never widgets): the handles and the
 * declared connections. `status` is `disconnected` for a connection with no
 * handle in this process (`live: false`, which is no failure); the
 * configuration fields only come with a type.
 */
export type ConnectionView = {
    name: string;
    type: string;
    status: ConnectionStatus;
    /** The account id tools and variables use, for a multi-instance type. */
    account?: string;
    state?: ConnectionState;
    /** The labels of the required fields without a value, when `state` is `incomplete`. */
    missing?: string[];
    /** Why the last start could not use it, when known: names options or variables, never a value. */
    reason?: string;
    /** `false`: no handle runs in this process, so `status` says nothing about the connection. */
    live?: boolean;
    editable?: boolean;
    deletable?: boolean;
};

/** `GET /connections/{name}`: `widgets`, `canReset` and `live: true` only for a holder of `chamvi_connection_write` for it. */
export type ConnectionDetailView = ConnectionView & {
    widgets?: ConnectionWidget[];
    /** The connection offers a reset (`POST /connections/{name}/reset` does not answer 404). */
    canReset?: boolean;
};

/** A field of `GET /connection-types`: what a form needs. */
export type ConnectionTypeFieldView = {
    key: string;
    label: string;
    kind: ConnectionFieldKind;
    required?: boolean;
    description?: string;
    options?: readonly string[];
    multiline?: boolean;
    /** Changing it needs every secret of the connection again. */
    bindsSecrets?: boolean;
};

/** One entry of `GET /connection-types`. */
export type ConnectionTypeView = {
    type: string;
    label: string;
    multiple: boolean;
    /** Accounts of the type can be added from the dashboard now. */
    creatable: boolean;
    /** `POST /connections/{name}/test` does not answer 404. */
    testable: boolean;
    fields: ConnectionTypeFieldView[];
};

export type ConnectionSettingsFieldView = {
    key: string;
    source: ConnectionFieldSource;
    /** Only on a secret: whether it has a value. Never the value. */
    set?: boolean;
};

/**
 * `GET /connections/{name}/config`. `settings` holds stored plain values only:
 * never a secret, and never a field locked by env or code.
 */
export type ConnectionSettingsView = {
    type: string;
    state: ConnectionState;
    /** The labels of the required fields without a value, when `state` is `incomplete`. */
    missing?: string[];
    /** Why the last start could not use it, when known and no save is waiting for a restart. */
    reason?: string;
    settings: Record<string, unknown>;
    fields: ConnectionSettingsFieldView[];
    /** The stored config revision, 0 without a row: a save sends it back. */
    revision: number;
    /** The row's generation, absent without a row: a save sends it back. */
    generation?: string;
    /** The stored revision or generation is not the one this process loaded. */
    restartRequired: boolean;
    editable: boolean;
    deletable: boolean;
};

/** `POST /connections/{name}/test`; `message` never carries a secret. */
export type ConnectionTestView = {
    ok: boolean;
    message?: string;
};

/** Secret values by field name; `''` or `null` keeps the stored value. */
export type ConnectionSecretValues = Record<string, string | null>;

/**
 * `PUT /connections/{name}/config`. An empty value is unset. `revision` and
 * `generation` are the ones of the view the save was made from: another save,
 * a reset or a delete and create since then answers 409 `connection_changed`.
 */
export type ConnectionSaveBody = {
    revision: number;
    /** Absent when the view had none (no row yet). */
    generation?: string;
    /** The complete settings: replaces the stored ones. Absent keeps them. */
    settings?: Record<string, unknown>;
    secrets?: {
        set?: ConnectionSecretValues;
        clear?: string[];
    };
};

/** `POST /connection-types/{type}/connections`; `secrets` by field name. */
export type ConnectionCreateBody = {
    account: string;
    settings: Record<string, unknown>;
    secrets?: ConnectionSecretValues;
};
