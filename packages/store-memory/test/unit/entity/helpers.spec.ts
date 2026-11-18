/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { matcherOf, matches } from '../../../src/entity/helpers.ts';

describe('matcherOf', () => {
    it('matches any value of a list of plain values, keeping types apart', () => {
        const match = matcherOf({ id: ['a', 'b', 1] });

        expect(match({ id: 'b' })).toBe(true);
        expect(match({ id: 1 })).toBe(true);
        expect(match({ id: '1' })).toBe(false);
        expect(match({ id: 'c' })).toBe(false);
    });

    it('lets a null in a list match a missing value', () => {
        const match = matcherOf({ parentId: ['p', null] });

        expect(match({ parentId: null })).toBe(true);
        expect(match({})).toBe(true);
        expect(match({ parentId: 'q' })).toBe(false);
    });

    it('compares a list of objects by value', () => {
        const match = matcherOf({ at: [new Date(1000)] });

        expect(match({ at: new Date(1000) })).toBe(true);
        expect(match({ at: new Date(2000) })).toBe(false);
    });

    it('agrees with matches for every condition of the where', () => {
        const where = {
            id: ['a'], 
            kind: 'x', 
            deletedAt: null, 
        };

        for (const row of [{ id: 'a', kind: 'x' }, { id: 'a', kind: 'y' }, {
            id: 'a', 
            kind: 'x', 
            deletedAt: 1, 
        }]) {
            expect(matcherOf(where)(row)).toBe(matches(row, where));
        }
    });

    it('matches a long list against many rows without comparing each pair', () => {
        const ids = Array.from({ length: 50_000 }, (_, i) => `id-${i}`);
        const match = matcherOf({ id: ids });
        const started = performance.now();

        expect(ids.filter((id) => match({ id }))).toHaveLength(ids.length);
        // pairwise this is 2.5e9 comparisons (minutes); a lookup is milliseconds
        expect(performance.now() - started).toBeLessThan(2000);
    });
});
