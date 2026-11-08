/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { testUuid } from '@chamvi/test-kit';

describe('testUuid', () => {
    it('is deterministic and uuid-shaped', () => {
        expect(testUuid('r1')).toBe(testUuid('r1'));
        expect(testUuid('r1')).toMatch(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
        expect(testUuid('r1')).not.toBe(testUuid('r2'));
    });

    it('keeps the byte order of labels', () => {
        expect(testUuid('a') < testUuid('b')).toBe(true);
        expect(testUuid('a') < testUuid('a1')).toBe(true);
        expect(testUuid('r1') < testUuid('r2')).toBe(true);
    });

    it('refuses a label above 16 bytes', () => {
        expect(() => testUuid('x'.repeat(16))).not.toThrow();
        expect(() => testUuid('x'.repeat(17))).toThrow(RangeError);
    });
});
