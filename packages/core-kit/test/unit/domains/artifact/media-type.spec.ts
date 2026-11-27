/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { isArtifactMediaType } from '@chamvi/core-kit';

describe('isArtifactMediaType', () => {
    it.each(['image/png', 'application/vnd.api+json', 'TEXT/Plain', 'x-a/b.c_d'])('accepts %s', (value) => {
        expect(isArtifactMediaType(value)).toBe(true);
    });

    it.each([
        ['no subtype', 'image'],
        ['empty', ''],
        ['a space', 'image/ png'],
        ['parameters', 'text/plain; charset=utf-8'],
        ['a leading symbol', '+a/b'],
        ['a type above 127 characters', `${'a'.repeat(128)}/b`],
        ['a number', 42],
        ['undefined', undefined],
    ])('refuses %s', (_, value) => {
        expect(isArtifactMediaType(value)).toBe(false);
    });
});
