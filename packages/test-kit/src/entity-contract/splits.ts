/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { expect, it } from 'vitest';
import { DEFAULT_PARAMETER_LIMIT } from './constants.ts';
import type { EntityContractRepositories, EntityRepositoryContractInput } from './types.ts';
import {
    idsOf,
    insertParent,
    parentOf,
    uuid,
} from './helpers.ts';

function absent(prefix: string, count: number): string[] {
    return Array.from({ length: count }, (_, i) => `${prefix}-absent-${i}`);
}

/**
 * The cases of a where beyond one statement: the arrays of a where
 * together above the driver's bind limit, and repeated values in an
 * array the driver splits.
 */
export function registerEntitySplitCases(repositories: EntityContractRepositories, input: EntityRepositoryContractInput): void {
    const limit = input.parameterLimit ?? DEFAULT_PARAMETER_LIMIT;
    const half = Math.floor(limit / 2);

    it('a where whose arrays and values together exceed the bind limit matches as one statement would', async () => {
        const { parents } = repositories;

        for (const n of [1, 2, 3, 4]) {
            await insertParent(parents, n);
        }

        // more names than half the limit, the labels the rest of it, one more value beside them
        const where = {
            name: ['parent-1', 'parent-2', 'parent-4', ...absent('name', half - 2)],
            label: ['label-1', 'label-2', 'label-3', ...absent('label', limit - half - 3)],
            counter: 0,
        };

        expect(await parents.findManyBy(where)).toEqual([parentOf(1), parentOf(2)]);
        expect(await parents.removeManyBy(where)).toBe(2);
        expect(idsOf(await parents.findManyBy({}))).toEqual([uuid(3), uuid(4)]);
    }, 120_000);

    it('a repeated value in an array beyond the bind limit matches its row once, in key order', async () => {
        const { parents } = repositories;

        await insertParent(parents, 1);
        await insertParent(parents, 2);
        await insertParent(parents, 3, { note: 'note-3' });

        const labels = ['label-2', 'label-1', ...absent('label', limit), 'label-1', 'label-2'];
        const ids = [uuid(1), ...Array.from({ length: limit }, (_, i) => uuid(1_000_000 + i)), uuid(1)];
        const notes = [null, ...absent('note', limit), null, 'note-3'];

        expect(await parents.findManyBy({ label: labels })).toEqual([parentOf(1), parentOf(2)]);
        expect(await parents.findManyBy({ id: ids })).toEqual([parentOf(1)]);
        expect(idsOf(await parents.findManyBy({ note: notes }))).toEqual([uuid(1), uuid(2), uuid(3)]);
        expect(await parents.removeManyBy({ label: labels })).toBe(2);
        expect(idsOf(await parents.findManyBy({}))).toEqual([uuid(3)]);
    }, 120_000);
}
