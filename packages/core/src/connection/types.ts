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
