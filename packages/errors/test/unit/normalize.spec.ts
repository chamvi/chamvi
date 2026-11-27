/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { normalizeError } from '@chamvi/errors';

describe('normalizeError', () => {
    it('returns an error as is', () => {
        const error = new Error('foo');

        expect(normalizeError(error)).toBe(error);
    });

    it('wraps a string', () => {
        const error = normalizeError('foo');

        expect(error).toBeInstanceOf(Error);
        expect(error.message).toEqual('foo');
    });

    it('stringifies any other value', () => {
        expect(normalizeError(42).message).toEqual('42');
        expect(normalizeError(undefined).message).toEqual('undefined');
    });
});
