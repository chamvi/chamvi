/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    createCipheriv,
    createDecipheriv,
    randomBytes,
} from 'node:crypto';
import { DecryptionFailedError, InvalidAgentDefinitionError, ValidationError } from '../errors/index.ts';
import {
    KEYRING_KEY_LENGTH,
    SEAL_IV_LENGTH,
    SEAL_TAG_LENGTH,
} from './constants.ts';
import {
    assertKeyBytes,
    assertKeyId,
    decodeBase64,
} from './helpers.ts';
import type { IKeyring, KeyringKey, WrappedKey } from './types.ts';

const ALGORITHM = 'aes-256-gcm';

/**
 * AES-256-GCM under `key` with a random 12-byte IV, bound to `aad`:
 * `iv | ciphertext | tag` as one plain Uint8Array. An `aad` that is not
 * well-formed UTF-16 throws ValidationError: lone surrogates encode to the
 * same UTF-8 bytes, so two such contexts would share one AAD.
 */
export function seal(key: Uint8Array, plaintext: Uint8Array, aad: string): Uint8Array {
    assertKeyBytes(key, 'seal');

    if (typeof aad !== 'string' || !aad.isWellFormed()) {
        throw new ValidationError('A seal aad must be a well-formed string.');
    }

    const iv = randomBytes(SEAL_IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: SEAL_TAG_LENGTH });

    cipher.setAAD(Buffer.from(aad, 'utf8'));

    const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const out = new Uint8Array(SEAL_IV_LENGTH + body.length + SEAL_TAG_LENGTH);

    out.set(iv, 0);
    out.set(body, SEAL_IV_LENGTH);
    out.set(cipher.getAuthTag(), SEAL_IV_LENGTH + body.length);

    return out;
}

/**
 * The plaintext of `seal(key, plaintext, aad)`. Any failure (a wrong key or
 * AAD, an AAD that is not well-formed UTF-16, a tampered or truncated input)
 * throws one DecryptionFailedError with a fixed message.
 */
export function open(key: Uint8Array, sealed: Uint8Array, aad: string): Uint8Array {
    if (
        !(key instanceof Uint8Array) ||
        key.length !== KEYRING_KEY_LENGTH ||
        !(sealed instanceof Uint8Array) ||
        sealed.length < SEAL_IV_LENGTH + SEAL_TAG_LENGTH ||
        typeof aad !== 'string' ||
        !aad.isWellFormed()
    ) {
        throw new DecryptionFailedError();
    }

    try {
        const iv = sealed.subarray(0, SEAL_IV_LENGTH);
        const tag = sealed.subarray(sealed.length - SEAL_TAG_LENGTH);
        const body = sealed.subarray(SEAL_IV_LENGTH, sealed.length - SEAL_TAG_LENGTH);
        const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: SEAL_TAG_LENGTH });

        decipher.setAAD(Buffer.from(aad, 'utf8'));
        decipher.setAuthTag(tag);

        return new Uint8Array(Buffer.concat([decipher.update(body), decipher.final()]));
    } catch {
        throw new DecryptionFailedError();
    }
}

/**
 * A keyring over ordered master keys, the first active. Throws
 * InvalidAgentDefinitionError for an empty list, an id that breaks the
 * agent-name rule, a duplicate id or a key that is not 32 bytes (messages
 * name the entry index, never key material). The keys are copied.
 */
export function createKeyring(keys: readonly KeyringKey[]): IKeyring {
    if (!Array.isArray(keys) || keys.length === 0) {
        throw new InvalidAgentDefinitionError('A keyring needs at least one key.');
    }

    const byId = new Map<string, Uint8Array>();

    keys.forEach((entry, index) => {
        const label = `Keyring entry ${index + 1}`;

        assertKeyId(entry?.id, label);
        assertKeyBytes(entry.key, label);

        if (byId.has(entry.id)) {
            throw new InvalidAgentDefinitionError(`${label}: the key id is used by an earlier entry.`);
        }

        byId.set(entry.id, new Uint8Array(entry.key));
    });

    const activeId = keys[0]!.id;
    const active = byId.get(activeId)!;

    return {
        activeId,
        createDataKey(context: string) {
            const key = new Uint8Array(randomBytes(KEYRING_KEY_LENGTH));
            const wrapped: WrappedKey = { keyId: activeId, wrapped: seal(active, key, context) };

            return { key, wrapped };
        },
        unwrap(wrapped: WrappedKey, context: string) {
            const master = byId.get(wrapped.keyId);

            if (!master) {
                throw new DecryptionFailedError(wrapped.keyId);
            }

            return open(master, wrapped.wrapped, context);
        },
    };
}

/**
 * Parses `<id>:<base64 32 bytes>[,<id>:<base64>...]` (whitespace around an
 * entry ignored) into keyring keys, the first active. Throws
 * InvalidAgentDefinitionError naming the entry index, never the value.
 */
export function parseKeyring(value: string): KeyringKey[] {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new InvalidAgentDefinitionError('The keyring value holds no key.');
    }

    const keys = value.split(',').map((raw, index): KeyringKey => {
        const label = `Keyring entry ${index + 1}`;
        const entry = raw.trim();
        const separator = entry.indexOf(':');

        if (separator === -1) {
            throw new InvalidAgentDefinitionError(`${label}: expected <id>:<base64 key>.`);
        }

        const id = entry.slice(0, separator);

        assertKeyId(id, label);

        const key = decodeBase64(entry.slice(separator + 1));

        if (!key) {
            throw new InvalidAgentDefinitionError(`${label}: the key is not valid base64.`);
        }

        assertKeyBytes(key, label);

        return { id, key };
    });

    createKeyring(keys);

    return keys;
}
