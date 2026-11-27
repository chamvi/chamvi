/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { EntityConflictError, EntityInvalidError, EntityRelationError } from '@chamvi/errors';
import {
    defineQuery,
    eq,
    inArray,
    ne,
} from '@rapiq/core';
import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import type { EntityContractParent } from '@chamvi/test-kit';
import { DatabaseUnavailableError } from '../../../src/error/index.ts';
import { postgres } from '../../utils/database.ts';
import { openFixtureDataSource } from '../../utils/entity/data-source.ts';
import type { FixtureDataSource } from '../../utils/entity/data-source.ts';
import { QueryLog } from '../../utils/entity/logger.ts';
import { createFixtureRepositories } from '../../utils/entity/repositories.ts';
import type { FixtureRepositories } from '../../utils/entity/repositories.ts';
import type { FixtureDriver } from '../../utils/entity/schemas.ts';

const MARKER = 'marker-0815-content';

function uuid(n: number): string {
    return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

function withoutLabel(parent: EntityContractParent): EntityContractParent {
    const copy: Partial<EntityContractParent> = { ...parent };

    delete copy.label;

    return copy as EntityContractParent;
}

function parentOf(n: number, patch: Partial<EntityContractParent> = {}): EntityContractParent {
    return {
        id: uuid(n),
        name: `parent-${n}`,
        note: null,
        counter: 0,
        label: `label-${n}`,
        createdAt: new Date(Date.UTC(2026, 0, 1) + n),
        ...patch,
    };
}

async function errorOf(promise: Promise<unknown>): Promise<unknown> {
    try {
        await promise;
    } catch (error) {
        return error;
    }

    return expect.unreachable('expected a rejection');
}

const drivers: { driver: FixtureDriver; skip: boolean }[] = [
    { driver: 'postgres', skip: !postgres },
    { driver: 'better-sqlite3', skip: false },
];

describe.each(drivers)('entity repository adapter on $driver', ({ driver, skip }) => {
    let fixture: FixtureDataSource;
    let log: QueryLog;
    let repositories: FixtureRepositories;

    beforeAll(async () => {
        if (skip) {
            return;
        }

        log = new QueryLog();
        fixture = await openFixtureDataSource(driver, { logger: log });
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
        log.clear();
    });

    describe.skipIf(skip)(driver, () => {
        it('toEntity/fromEntity map a nested value', async () => {
            const { claims } = repositories;
            const expiresAt = new Date(Date.UTC(2026, 5, 1));

            await claims.save(claims.create({
                id: uuid(1),
                name: 'held',
                claim: { owner: 'o1', expiresAt },
            }));
            await claims.save(claims.create({ id: uuid(2), name: 'free' }));

            const rows = await fixture.dataSource.getRepository(fixture.schemas.claim).find({ order: { id: 'ASC' } });

            expect(rows.map((row) => [row.claimOwner, row.claimExpiresAt?.getTime() ?? null]))
                .toEqual([['o1', expiresAt.getTime()], [null, null]]);

            const held = (await claims.findOneById(uuid(1)))!;

            expect(held).toEqual({
                id: uuid(1),
                name: 'held',
                claim: { owner: 'o1', expiresAt },
            });
            expect(await claims.findOneById(uuid(2))).toEqual({ id: uuid(2), name: 'free' });

            // a public field path reaches its column through the field map
            const owned = await claims.findMany(defineQuery({ filters: eq('claim.owner', 'o1') }));

            expect(owned.data).toEqual([held]);

            const sorted = await claims.findMany(defineQuery({ sorts: { 'claim.expiresAt': 'ASC', id: 'ASC' } }));

            expect(sorted.meta.total).toBe(2);

            // a field selection names public paths too: they reach their columns through the field map
            const selected = await claims.findMany(defineQuery({
                fields: ['id', 'claim.owner', 'claim.expiresAt'],
                filters: eq('claim.owner', 'o1'),
            }));

            expect(selected.data).toEqual([{ id: uuid(1), claim: { owner: 'o1', expiresAt } }]);

            // a property removed from the read value clears its columns
            delete held.claim;
            await claims.save(held);

            expect(await claims.findOneById(uuid(1))).toEqual({ id: uuid(1), name: 'held' });
        });

        it('a non-uuid id reads as null', async () => {
            const { parents, children } = repositories;

            await parents.save(parents.create(parentOf(1)));

            expect(await parents.findOneById('not-a-uuid')).toBeNull();
            expect(await parents.findOneBy({ id: 'not-a-uuid' })).toBeNull();
            expect(await parents.findManyBy({ id: 'not-a-uuid' })).toEqual([]);
            expect((await parents.findManyBy({ id: ['not-a-uuid', uuid(1)] } as never)).map((row) => row.id)).toEqual([uuid(1)]);
            expect(await parents.findManyBy({ id: ['not-a-uuid'] } as never)).toEqual([]);

            expect((await parents.findMany(defineQuery({ filters: eq('id', 'not-a-uuid') }))).meta.total).toBe(0);
            expect((await parents.findMany(defineQuery({ filters: inArray('id', ['not-a-uuid', uuid(1)]) }))).data.map((row) => row.id))
                .toEqual([uuid(1)]);
            expect((await parents.findMany(defineQuery({ filters: ne('id', 'not-a-uuid') }))).meta.total).toBe(1);

            expect(await parents.transaction((repository) => repository.findOneById('not-a-uuid'))).toBeNull();

            // a reference that is not a uuid is a missing parent, never a driver error
            const error = await errorOf(children.save(children.create({
                id: uuid(11),
                parentId: 'not-a-uuid',
                label: 'c',
            })));

            expect(error).toBeInstanceOf(EntityRelationError);
            expect(error).toMatchObject({ entity: 'child', relation: 'parent' });
        });

        it('save of a read entity writes its changed columns only, and nothing when nothing changed', async () => {
            const { parents } = repositories;

            await parents.save(parents.create(parentOf(1)));

            const row = (await parents.findOneById(uuid(1)))!;

            log.clear();
            await parents.save(row);

            expect(log.queries.some((query) => /^UPDATE/i.test(query))).toBe(false);

            parents.merge(row, { counter: 3 });
            log.clear();
            await parents.save(row);

            const updates = log.queries.filter((query) => /^UPDATE/i.test(query));

            expect(updates).toHaveLength(1);
            expect(updates[0]).toMatch(/"counter"/);
            expect(updates[0]).not.toMatch(/"label"|"name"|"note"/);
            expect(log.queries.some((query) => /^INSERT/i.test(query))).toBe(false);
        });

        it('a value the table refuses is EntityInvalidError naming the column or constraint, never the value', async () => {
            const { parents } = repositories;

            const missing = await errorOf(parents.save(parents.create(withoutLabel(parentOf(1, { name: MARKER, note: MARKER })))));

            expect(missing).toBeInstanceOf(EntityInvalidError);
            expect(missing).toMatchObject({
                code: 'entity_invalid',
                entity: 'parent',
                operation: 'save',
                field: 'label',
            });
            expect((missing as Error).cause).toBeUndefined();

            const checked = await errorOf(parents.save(parents.create(parentOf(2, { counter: -1 }))));

            expect(checked).toBeInstanceOf(EntityInvalidError);
            expect(checked).toMatchObject({
                entity: 'parent',
                operation: 'save',
                field: 'parent_counter_check',
            });

            // a read entity updated to a refused value
            const stored = await parents.save(parents.create(parentOf(3)));

            parents.merge(stored, { counter: -2 });
            expect(await errorOf(parents.save(stored))).toBeInstanceOf(EntityInvalidError);

            const upserted = await errorOf(parents.upsert(parentOf(4, { counter: -3 })));

            expect(upserted).toBeInstanceOf(EntityInvalidError);
            expect(upserted).toMatchObject({ operation: 'upsert' });

            // SQLite does not enforce a varchar's length
            if (driver === 'postgres') {
                const long = await errorOf(parents.save(parents.create(parentOf(5, { name: MARKER.repeat(8) }))));

                expect(long).toBeInstanceOf(EntityInvalidError);
                expect(long).toMatchObject({ entity: 'parent', operation: 'save' });
            }

            expect(await parents.findManyBy({ label: 'label-3' })).toEqual([parentOf(3)]);
        });

        it('a driver error that is no refused value is DatabaseUnavailableError with the driver\'s code', async () => {
            const { records } = repositories;
            const query = fixture.dataSource.createQueryRunner();

            await query.query('ALTER TABLE "test_entity_records" RENAME TO "test_entity_records_moved"');

            try {
                const error = await errorOf(records.save(records.create({
                    id: uuid(1),
                    scope: MARKER,
                    name: MARKER,
                    value: 1,
                })));

                expect(error).toBeInstanceOf(DatabaseUnavailableError);
                expect(error).toMatchObject({
                    code: 'database_unavailable',
                    operation: 'save',
                    driverCode: driver === 'postgres' ? '42P01' : 'SQLITE_ERROR',
                });
                expect((error as Error).cause).toBeUndefined();
            } finally {
                await query.query('ALTER TABLE "test_entity_records_moved" RENAME TO "test_entity_records"');
                await query.release();
            }
        });

        it('no error carries the row\'s content, the statement or the url', async () => {
            const { parents, children } = repositories;
            const unlabelled = withoutLabel(parentOf(3, { name: `${MARKER}-3`, note: MARKER }));
            const stored = await parents.save(parents.create(parentOf(1, { name: MARKER, note: MARKER })));

            await children.save(children.create({
                id: uuid(11),
                parentId: uuid(1),
                label: MARKER,
            }));

            const errors = [
                await errorOf(parents.save(parents.create(unlabelled))),
                await errorOf(parents.save(parents.create(parentOf(5, { name: `${MARKER}-5`, counter: -1 })))),
                await errorOf(parents.save(parents.create(parentOf(2, { name: MARKER, note: MARKER })))),
                await errorOf(children.save(children.create({
                    id: uuid(12),
                    parentId: uuid(9),
                    label: MARKER,
                }))),
                await errorOf(parents.remove(stored)),
                await errorOf(parents.transaction(async (repository) => {
                    await repository.save(repository.create(parentOf(4, { name: MARKER, note: MARKER })));
                })),
            ];

            expect(errors[0]).toBeInstanceOf(EntityInvalidError);
            expect(errors[1]).toBeInstanceOf(EntityInvalidError);
            expect(errors[2]).toBeInstanceOf(EntityConflictError);
            expect(errors[3]).toBeInstanceOf(EntityRelationError);
            expect(errors[3]).toMatchObject({ entity: 'child', relation: 'parent' });
            expect(errors[4]).toBeInstanceOf(EntityRelationError);
            expect(errors[4]).toMatchObject({ entity: 'child', relation: 'parent' });
            expect(errors[5]).toBeInstanceOf(EntityConflictError);

            const forbidden = [MARKER, uuid(1), uuid(9), 'INSERT', 'SELECT', 'DELETE', 'UPDATE', 'test_entity_'];

            if (fixture.url) {
                forbidden.push(fixture.url, `${postgres!.username}:${postgres!.password}@`, '://');
            }

            for (const error of errors) {
                expect((error as Error).cause).toBeUndefined();

                const text = [
                    (error as Error).message,
                    String(error),
                    JSON.stringify(error),
                    ...Object.values(error as object).map(String),
                ].join(' ');

                for (const value of forbidden) {
                    expect(text).not.toContain(value);
                }
            }
        });

        it('the lock mode reaches the statement', async () => {
            const expected = {
                update: 'FOR UPDATE',
                'no-key-update': 'FOR NO KEY UPDATE',
                share: 'FOR SHARE',
            };

            for (const lock of ['update', 'no-key-update', 'share'] as const) {
                const { parents } = createFixtureRepositories(fixture, { lock });
                const locks: Record<string, (string | null)[]> = {};
                const record = async (name: string, call: () => Promise<unknown>) => {
                    log.clear();
                    await call();
                    locks[name] = log.queries
                        .filter((query) => /^SELECT/i.test(query))
                        .map((query) => /\bFOR (UPDATE|NO KEY UPDATE|SHARE)\b/.exec(query)?.[0] ?? null);
                };

                await fixture.clear();
                await parents.save(parents.create(parentOf(1)));

                await record('outside', () => parents.findOneById(uuid(1)));
                await parents.transaction(async (repository) => {
                    await record('findManyBy', () => repository.findManyBy({}));
                    await record('findMany', () => repository.findMany(defineQuery({})));
                    await record('findOneById', () => repository.findOneById(uuid(1)));
                    await record('findOneBy', () => repository.findOneBy({ name: 'parent-1' }));
                });

                const mode = driver === 'postgres' ? expected[lock] : null;

                expect(locks.outside).toEqual([null]);
                expect(locks.findManyBy).toEqual([null]);
                expect(locks.findMany!.length).toBeGreaterThan(0);
                expect(locks.findMany!.every((value) => value === null)).toBe(true);
                expect(locks.findOneById).toEqual([mode]);
                expect(locks.findOneBy).toEqual([mode]);
            }
        });

        it('a write outside a transaction waits for one in flight and never joins it', async () => {
            const { parents } = repositories;
            const failure = new Error('rejected');
            const { promise: held, resolve: release } = Promise.withResolvers<void>();
            const { promise: opened, resolve: started } = Promise.withResolvers<void>();

            const rejected = parents.transaction(async (repository) => {
                await repository.save(repository.create(parentOf(1)));
                started();
                await held;

                throw failure;
            });

            await opened;

            const outside = parents.save(parents.create(parentOf(2)));

            release();

            await expect(rejected).rejects.toBe(failure);
            await outside;

            expect(await parents.findOneById(uuid(1))).toBeNull();
            expect(await parents.findOneById(uuid(2))).toEqual(parentOf(2));
        });
    });
});
