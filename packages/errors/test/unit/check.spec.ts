/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { BaseError } from '@ebec/core';
import { describe, expect, it } from 'vitest';
import {
    ChamviError,
    NotFoundError,
    isChamviError,
    isError,
} from '@chamvi/errors';

const roundtrip = (input: unknown) => JSON.parse(JSON.stringify(input));

describe('isError', () => {
    it('matches errors and rejects other values', () => {
        expect(isError(new Error('foo'))).toBe(true);
        expect(isError(new ChamviError('foo'))).toBe(true);
        expect(isError('foo')).toBe(false);
        expect(isError(null)).toBe(false);
    });
});

describe('isChamviError', () => {
    it('matches an instance and its JSON round trip', () => {
        expect(isChamviError(new ChamviError({ code: 'x' }))).toBe(true);
        expect(isChamviError(roundtrip(new ChamviError({ code: 'x' })))).toBe(true);
    });

    it('matches a subclass instance', () => {
        expect(isChamviError(new NotFoundError())).toBe(true);
    });

    it('rejects a foreign BaseError', () => {
        expect(isChamviError(new BaseError({ issues: [] }))).toBe(false);
    });

    it('rejects a chain-less payload', () => {
        expect(isChamviError({
            name: 'ChamviError', 
            message: 'foo', 
            code: 'x', 
        })).toBe(false);
    });

    it('rejects non-objects', () => {
        expect(isChamviError(undefined)).toBe(false);
        expect(isChamviError('foo')).toBe(false);
    });
});
