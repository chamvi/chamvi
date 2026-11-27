/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { EntityQueryError } from '@chamvi/errors';
import {
    defineQuery,
    eq,
    gte,
    inArray,
    lt,
    ne,
} from '@rapiq/core';
import type { ICondition } from '@rapiq/core';
import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import type { EntityContractChild, EntityContractParent } from '@chamvi/test-kit';
import { applyQuery } from '../../../src/query/index.ts';
import { postgres } from '../../utils/database.ts';
import { openFixtureDataSource } from '../../utils/entity/data-source.ts';
import type { FixtureDataSource } from '../../utils/entity/data-source.ts';
import { createFixtureRepositories } from '../../utils/entity/repositories.ts';
import type { FixtureRepositories } from '../../utils/entity/repositories.ts';
import type { FixtureDriver } from '../../utils/entity/schemas.ts';

function uuid(n: number): string {
    return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

function parentOf(n: number, name = `parent-${n}`): EntityContractParent {
    return {
        id: uuid(n),
        name,
        note: null,
        counter: n,
        label: 'label',
        createdAt: new Date(Date.UTC(2026, 0, 1) + n),
    };
}

const drivers: { driver: FixtureDriver; skip: boolean }[] = [
    { driver: 'postgres', skip: !postgres },
    { driver: 'better-sqlite3', skip: false },
];

describe.each(drivers)('list queries on $driver', ({ driver, skip }) => {
    let fixture: FixtureDataSource;
    let repositories: FixtureRepositories;

    beforeAll(async () => {
        if (!skip) {
            fixture = await openFixtureDataSource(driver, { guard: true });
        }
    });

    afterAll(async () => {
        await fixture?.dataSource.destroy();
    });

    beforeEach(async () => {
        if (skip) {
            return;
        }

        await fixture.clear();
        repositories = createFixtureRepositories(fixture);

        const { parents, children } = repositories;

        await parents.save(parents.create(parentOf(1)));
        await parents.save(parents.create(parentOf(2)));

        for (const [n, parent, label] of [[11, 1, 'b'], [12, 2, 'a'], [13, 1, 'b'], [14, 2, 'B']] as const) {
            await children.save(children.create({
                id: uuid(n),
                parentId: uuid(parent),
                label,
            }));
        }
    });

    describe.skipIf(skip)(driver, () => {
        it('findMany with a filter, a sort, pagination and an included relation', async () => {
            const { data, meta } = await repositories.children.findMany(defineQuery<EntityContractChild & { parent: EntityContractParent }>({
                filters: inArray('label', ['a', 'b']),
                sorts: { label: 'DESC', id: 'DESC' },
                pagination: { limit: 2, offset: 1 },
                relations: ['parent'],
            }));

            expect(meta).toEqual({
                total: 3,
                limit: 2,
                offset: 1,
            });
            expect(data.map((child) => child.id)).toEqual([uuid(11), uuid(12)]);
            expect((data[0] as EntityContractChild & { parent?: EntityContractParent }).parent).toMatchObject({ id: uuid(1), name: 'parent-1' });
            expect((data[1] as EntityContractChild & { parent?: EntityContractParent }).parent).toMatchObject({ id: uuid(2), name: 'parent-2' });
        });

        it('applyQuery matches case-sensitively, renames through the field map and drops a non-uuid value on a uuid column', async () => {
            const builder = () => fixture.dataSource.getRepository(fixture.schemas.child).createQueryBuilder('child');

            const exact = builder();

            await applyQuery(exact, defineQuery({ filters: eq('label', 'b') }));
            expect((await exact.getMany()).map((row) => row.id).sort()).toEqual([uuid(11), uuid(13)]);

            const renamed = builder();

            await applyQuery(renamed, defineQuery({ filters: eq('parent', uuid(2)), sorts: { id: 'ASC' } }), { fields: { parent: 'parentId' } });
            expect((await renamed.getMany()).map((row) => row.id)).toEqual([uuid(12), uuid(14)]);

            const foreign = builder();

            await applyQuery(foreign, defineQuery({ filters: inArray('parentId', ['no-uuid', uuid(1)]) }));
            expect((await foreign.getMany()).map((row) => row.id).sort()).toEqual([uuid(11), uuid(13)]);

            const nothing = builder();

            await applyQuery(nothing, defineQuery({ filters: eq('id', 'no-uuid') }));
            expect(await nothing.getMany()).toEqual([]);
        });

        it('applyQuery answers the page it applied', async () => {
            const paged = fixture.dataSource.getRepository(fixture.schemas.child).createQueryBuilder('child');

            expect(await applyQuery(paged, defineQuery({ pagination: { limit: 1, offset: 2 }, sorts: { id: 'ASC' } }))).toEqual({ limit: 1, offset: 2 });
            expect((await paged.getMany()).map((row) => row.id)).toEqual([uuid(13)]);
        });

        it('a date filter matches what the driver stored, whatever offset the request writes the instant in', async () => {
            const { parents } = repositories;
            const at = (iso: string) => new Date(iso);

            for (const [n, iso] of [[21, '2026-11-15T23:30:00.000Z'], [22, '2026-11-16T00:30:00.000Z'], [23, '2026-11-16T12:00:00.000Z']] as const) {
                await parents.save(parents.create({ ...parentOf(n), createdAt: at(iso) }));
            }

            const ids = async (filter: ICondition) => (await parents.findMany(defineQuery({
                filters: filter,
                sorts: { id: 'ASC' },
            }))).data.map((parent) => parent.id).filter((id) => id >= uuid(21));

            // 2026-11-16T02:30+02:00 is 00:30Z
            expect(await ids(eq('createdAt', '2026-11-16T02:30:00+02:00'))).toEqual([uuid(22)]);
            expect(await ids(eq('createdAt', at('2026-11-16T00:30:00Z')))).toEqual([uuid(22)]);
            expect(await ids(gte('createdAt', '2026-11-16T02:00:00+02:00'))).toEqual([uuid(22), uuid(23)]);
            expect(await ids(lt('createdAt', '2026-11-16T00:00:00Z'))).toEqual([uuid(21)]);
            expect(await ids(inArray('createdAt', ['2026-11-16T01:30:00+01:00', '2026-11-16T12:00:00Z']))).toEqual([uuid(22), uuid(23)]);
            expect(await ids(ne('createdAt', '2026-11-16T12:00:00.000Z'))).toEqual([uuid(21), uuid(22)]);
        });

        it('a value on a date column that names no instant is EntityQueryError, never a filter', async () => {
            const { parents } = repositories;

            await parents.save(parents.create(parentOf(21)));

            for (const filter of [
                eq('createdAt', 'not-a-date'),
                ne('createdAt', 'not-a-date'),
                gte('createdAt', 'not-a-date'),
                inArray('createdAt', ['not-a-date', '2026-11-16T12:00:00Z']),
                eq('createdAt', true),
            ]) {
                const error = await parents.findMany(defineQuery({ filters: filter })).then(() => undefined, (e: unknown) => e);

                expect(error).toBeInstanceOf(EntityQueryError);
                expect(error).toMatchObject({ entity: 'parent' });
                expect((error as Error).message).not.toContain('not-a-date');
            }

            const builder = fixture.dataSource.getRepository(fixture.schemas.parent).createQueryBuilder('parent');

            await expect(applyQuery(builder, defineQuery({ filters: eq('createdAt', 'not-a-date') }))).rejects.toBeInstanceOf(EntityQueryError);
            // null stays a filter for an absent value
            expect((await parents.findMany(defineQuery({ filters: eq('createdAt', null) }))).meta.total).toBe(0);
        });
    });
});
