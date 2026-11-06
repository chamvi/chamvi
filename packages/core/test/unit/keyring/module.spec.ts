/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
    DecryptionFailedError,
    ErrorCode,
    InvalidAgentDefinitionError,
    createKeyring,
    open,
    parseKeyring,
    seal,
} from '@chamvi/core';

const text = (value: string) => new TextEncoder().encode(value);
const key = () => new Uint8Array(randomBytes(32));
const base64 = (value: Uint8Array) => Buffer.from(value).toString('base64');

describe('seal and open', () => {
    it('round trips as iv | ciphertext | tag', () => {
        const dataKey = key();
        const sealed = seal(dataKey, text('hello'), 'ctx');

        expect(sealed).toBeInstanceOf(Uint8Array);
        expect(sealed.length).toBe(12 + 5 + 16);
        expect(Buffer.from(open(dataKey, sealed, 'ctx')).toString('utf8')).toBe('hello');
        expect(Buffer.from(seal(dataKey, text('hello'), 'ctx'))).not.toEqual(Buffer.from(sealed));
    });

    it('fails on a tampered byte, a wrong aad or a wrong key with DecryptionFailedError', () => {
        const dataKey = key();
        const sealed = seal(dataKey, text('hello'), 'ctx');

        for (const index of [0, 13, sealed.length - 1]) {
            const tampered = sealed.slice();

            tampered[index]! ^= 1;
            expect(() => open(dataKey, tampered, 'ctx')).toThrow(DecryptionFailedError);
        }

        expect(() => open(dataKey, sealed, 'other')).toThrow(DecryptionFailedError);
        expect(() => open(key(), sealed, 'ctx')).toThrow(DecryptionFailedError);
        expect(() => open(dataKey, sealed.slice(0, 20), 'ctx')).toThrow(DecryptionFailedError);

        const messages = new Set<string>();

        for (const run of [
            () => open(dataKey, sealed, 'other'),
            () => open(key(), sealed, 'ctx'),
            () => open(dataKey, sealed.slice(0, 20), 'ctx'),
        ]) {
            try {
                run();
            } catch (error) {
                expect(error).toMatchObject({ code: ErrorCode.DECRYPTION_FAILED });
                messages.add((error as Error).message);
            }
        }

        expect(messages.size).toBe(1);
    });
});

describe('createKeyring', () => {
    it('wraps a fresh data key under the active key and unwraps it with the same context', () => {
        const keyring = createKeyring([{ id: 'k1', key: key() }]);
        const { key: dataKey, wrapped } = keyring.createDataKey('connection:wa');

        expect(keyring.activeId).toBe('k1');
        expect(dataKey.length).toBe(32);
        expect(wrapped.keyId).toBe('k1');
        expect(Buffer.from(keyring.unwrap(wrapped, 'connection:wa'))).toEqual(Buffer.from(dataKey));
        expect(() => keyring.unwrap(wrapped, 'connection:other')).toThrow(DecryptionFailedError);
    });

    it('unwraps a data key wrapped under k1 with [k2, k1]', () => {
        const k1 = key();
        const { key: dataKey, wrapped } = createKeyring([{ id: 'k1', key: k1 }]).createDataKey('ctx');
        const rotated = createKeyring([{ id: 'k2', key: key() }, { id: 'k1', key: k1 }]);

        expect(rotated.activeId).toBe('k2');
        expect(Buffer.from(rotated.unwrap(wrapped, 'ctx'))).toEqual(Buffer.from(dataKey));
        expect(rotated.createDataKey('ctx').wrapped.keyId).toBe('k2');
    });

    it('unwrap with only [k2] names k1 and contains no base64 of any key', () => {
        const k1 = key();
        const k2 = key();
        const { wrapped } = createKeyring([{ id: 'k1', key: k1 }]).createDataKey('ctx');
        const keyring = createKeyring([{ id: 'k2', key: k2 }]);
        let caught: unknown;

        try {
            keyring.unwrap(wrapped, 'ctx');
        } catch (error) {
            caught = error;
        }

        expect(caught).toBeInstanceOf(DecryptionFailedError);
        expect((caught as Error).message).toContain('"k1"');

        for (const secret of [k1, k2, wrapped.wrapped]) {
            expect((caught as Error).message).not.toContain(base64(secret));
            expect(JSON.stringify(caught)).not.toContain(base64(secret));
        }
    });

    it('refuses an empty list, a duplicate or bad id and a key that is not 32 bytes', () => {
        expect(() => createKeyring([])).toThrow(InvalidAgentDefinitionError);
        expect(() => createKeyring([{ id: 'k1', key: key() }, { id: 'k1', key: key() }])).toThrow(InvalidAgentDefinitionError);
        expect(() => createKeyring([{ id: 'K1', key: key() }])).toThrow(InvalidAgentDefinitionError);
        expect(() => createKeyring([{ id: 'k1', key: new Uint8Array(31) }])).toThrow(InvalidAgentDefinitionError);
    });

    it('copies the keys it is given', () => {
        const k1 = key();
        const keyring = createKeyring([{ id: 'k1', key: k1 }]);
        const { wrapped } = keyring.createDataKey('ctx');

        k1.fill(0);
        expect(() => keyring.unwrap(wrapped, 'ctx')).not.toThrow();
    });

    it('does not show key material when serialized', () => {
        const k1 = key();
        const keyring = createKeyring([{ id: 'k1', key: k1 }]);

        expect(JSON.stringify(keyring)).not.toContain(base64(k1));
        expect(JSON.stringify(Object.values(keyring))).not.toContain(`${String(k1[0])  },${  String(k1[1])}`);
    });
});

describe('parseKeyring', () => {
    it('parses two entries, the first active', () => {
        const k1 = key();
        const k2 = key();
        const keys = parseKeyring(`k2:${base64(k2)},k1:${base64(k1)}`);

        expect(keys.map((entry) => entry.id)).toEqual(['k2', 'k1']);
        expect(Buffer.from(keys[0]!.key)).toEqual(Buffer.from(k2));
        expect(Buffer.from(keys[1]!.key)).toEqual(Buffer.from(k1));
        expect(createKeyring(keys).activeId).toBe('k2');
    });

    it('tolerates whitespace around entries', () => {
        const k1 = key();

        expect(parseKeyring(` k1:${base64(k1)} `).map((entry) => entry.id)).toEqual(['k1']);
    });

    it.each([
        ['an empty value', () => ''],
        ['an entry without a separator', () => base64(key())],
        ['bad base64', () => `k1:${base64(key()).slice(0, -2)}!!`],
        ['a 31-byte key', () => `k1:${base64(new Uint8Array(randomBytes(31)))}`],
        ['a bad id', () => `K_1:${base64(key())}`],
        ['a duplicate id', () => `k1:${base64(key())},k1:${base64(key())}`],
        ['an empty entry', () => `k1:${base64(key())},,k2:${base64(key())}`],
    ])('rejects %s without echoing the input', (_label, build) => {
        const value = build();
        let caught: unknown;

        try {
            parseKeyring(value);
        } catch (error) {
            caught = error;
        }

        expect(caught).toBeInstanceOf(InvalidAgentDefinitionError);

        const { message } = (caught as Error);

        for (const part of value.split(/[,:]/).filter((piece) => piece.length > 3)) {
            expect(message).not.toContain(part);
        }
    });

    it('names the entry index in the error', () => {
        expect(() => parseKeyring(`k1:${base64(key())},k2:abc`)).toThrow(/entry 2/);
    });
});
