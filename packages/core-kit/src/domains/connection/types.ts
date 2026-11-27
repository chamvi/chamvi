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
