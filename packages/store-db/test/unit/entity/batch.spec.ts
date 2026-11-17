/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    afterAll,
    beforeAll,
    beforeEach,
    expect,
    it,
} from 'vitest';
import { EntityRelationError } from '@chamvi/store';
import type { EntityContractParent } from '@chamvi/test-kit';
import { describePostgres } from '../../utils/database.ts';
import { openFixtureDataSource } from '../../utils/entity/data-source.ts';
import type { FixtureDataSource } from '../../utils/entity/data-source.ts';
import { createFixtureRepositories } from '../../utils/entity/repositories.ts';
import type { FixtureRepositories } from '../../utils/entity/repositories.ts';

const COUNT = 70_000;

const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

const parentOf = (n: number): EntityContractParent => ({
    id: uuid(n),
    name: `parent-${n}`,
    note: null,
    counter: 0,
    label: 'l',
    createdAt: new Date(0),
});

describePostgres('batched removes of the adapter on postgres', () => {
    let fixture: FixtureDataSource;
    let repositories: FixtureRepositories;
    let parents: EntityContractParent[];

    beforeAll(async () => {
        fixture = await openFixtureDataSource('postgres');
    });

    afterAll(async () => {
        await fixture.dataSource.destroy();
    });

    beforeEach(async () => {
        await fixture.clear();
        repositories = createFixtureRepositories(fixture);
        parents = Array.from({ length: COUNT }, (_, i) => parentOf(i + 1));
        await repositories.parents.upsertMany(parents);
        // a reference to the last parent: the statement removing it is a later one than the first
        await repositories.children.save(repositories.children.create({
            id: uuid(COUNT + 1),
            parentId: uuid(COUNT),
            label: 'c',
        }));
    }, 300_000);

    it('removeMany of rows beyond one statement is all or nothing: a failing later statement leaves the earlier ones undone', async () => {
        await expect(repositories.parents.removeMany(parents)).rejects.toBeInstanceOf(EntityRelationError);
        expect(await repositories.parents.findManyBy({})).toHaveLength(COUNT);
    }, 300_000);

    it('removeManyBy with an array beyond one statement is all or nothing', async () => {
        await expect(repositories.parents.removeManyBy({ id: parents.map((parent) => parent.id) })).rejects.toBeInstanceOf(EntityRelationError);
        expect(await repositories.parents.findManyBy({})).toHaveLength(COUNT);
    }, 300_000);
});
