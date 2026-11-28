/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { ApiError, PATH_SEGMENT_INVALID_ERROR_CODE, encodePathSegment } from '@chamvi/http-kit';

describe('encodePathSegment', () => {
    it('percent-encodes the characters that would add a segment, a query or a fragment', () => {
        expect(encodePathSegment('a/b?c#d')).toBe('a%2Fb%3Fc%23d');
        expect(encodePathSegment('c d')).toBe('c%20d');
    });

    it('keeps @ literal', () => {
        expect(encodePathSegment('@me')).toBe('@me');
    });

    it.each([
        ['a@b', 'a@b'],
        ['a b', 'a%20b'],
        ['grüße', 'gr%C3%BC%C3%9Fe'],
        ['/', '%2F'],
    ])('encodes %j as %j', (input, output) => {
        expect(encodePathSegment(input)).toBe(output);
    });

    it('takes a number', () => {
        expect(encodePathSegment(7)).toBe('7');
    });

    it.each(['', '.', '..'])('refuses %j with an ApiError', (value) => {
        let caught: unknown;

        try {
            encodePathSegment(value);
        } catch (e) {
            caught = e;
        }

        expect(caught).toBeInstanceOf(ApiError);
        expect(caught).toMatchObject({
            status: 0,
            code: PATH_SEGMENT_INVALID_ERROR_CODE,
            message: `The path segment "${value}" is not valid.`,
        });
        expect(PATH_SEGMENT_INVALID_ERROR_CODE).toBe('path_segment_invalid');
    });

    it('keeps a dotted segment that is not a dot segment', () => {
        expect(encodePathSegment('...')).toBe('...');
        expect(encodePathSegment('.env')).toBe('.env');
    });
});
