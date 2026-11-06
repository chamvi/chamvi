/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** One master key of a keyring: an id (agent-name rule) and 32 key bytes. */
export type KeyringKey = {
    id: string;
    key: Uint8Array;
};

/** A data key sealed under the master key `keyId`. */
export type WrappedKey = {
    keyId: string;
    wrapped: Uint8Array;
};

/**
 * Envelope keys: master keys (the first is active) wrap per-purpose data
 * keys. The keys stay inside the keyring; nothing it returns or throws
 * carries master key material.
 */
export interface IKeyring {
    /** The id of the active master key (the first one). */
    readonly activeId: string;
    /**
     * A fresh random data key and its form wrapped under the active master
     * key, bound to `context` (the AAD): it unwraps only with the same context.
     */
    createDataKey(context: string): { key: Uint8Array; wrapped: WrappedKey };
    /**
     * The data key of `wrapped`. Throws DecryptionFailedError naming the key
     * id when the keyring does not hold it, and a generic one when the
     * context or the bytes do not match.
     */
    unwrap(wrapped: WrappedKey, context: string): Uint8Array;
}
