/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { ValidationError } from '@chamvi/core';
import { randomUuidV7 } from '../../../src/uuid/module.ts';

describe('randomUuidV7', () => {
    it.each([-1, 0.5, NaN, Infinity, 0x1000000000000])('refuses an unrepresentable UUID timestamp: %s', (timestamp) => {
        expect(() => randomUuidV7(timestamp)).toThrow(ValidationError);
    });

    it.each([0, 0xffffffffffff])('encodes the timestamp boundary: %s', (timestamp) => {
        const id = randomUuidV7(timestamp);

        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        expect(Number.parseInt(id.replaceAll('-', '').slice(0, 12), 16)).toBe(timestamp);
    });

    it('encodes Unix milliseconds with UUID v7 version and RFC variant and fresh randomness', () => {
        const timestamp = 1793970123456;
        const ids = Array.from({ length: 1000 }, () => randomUuidV7(timestamp));

        expect(new Set(ids).size).toBe(ids.length);

        for (const id of ids) {
            expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
            expect(Number.parseInt(id.replaceAll('-', '').slice(0, 12), 16)).toBe(timestamp);
        }
    });
});
