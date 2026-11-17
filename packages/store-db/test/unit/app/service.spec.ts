/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
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
    describe,
    expect,
    it,
} from 'vitest';
import { EntityConflictError, EntityQueryError } from '@chamvi/store';
import { MemoryRegistry } from '@chamvi/store-memory';
import { createTestDataSource } from '@chamvi/test-kit';
import { postgres } from '../../utils/database.ts';
import { DatabaseNoteRepository } from '../../fixtures/notes/database.ts';
import { NoteEntity } from '../../fixtures/notes/entity.ts';
import { MemoryNoteRepository } from '../../fixtures/notes/memory.ts';
import { NoteService } from '../../fixtures/notes/service.ts';
import type { INoteRepository } from '../../fixtures/notes/types.ts';

/** A driver opened once per file: `fresh()` hands an empty repository to each test. */
type Opened = { fresh(): Promise<INoteRepository>; close(): Promise<void> };

const repositories: Array<{
    name: string;
    skip: boolean;
    open(): Promise<Opened>
}> = [
    {
        name: 'MemoryEntityRepository',
        skip: false,
        open: async () => ({ fresh: async () => new MemoryNoteRepository(new MemoryRegistry()), close: async () => {} }),
    },
    {
        name: 'its EntityRepositoryAdapter subclass on SQLite (createTestDataSource)',
        skip: false,
        open: async () => {
            const dataSource = await createTestDataSource({ entities: [NoteEntity] });

            return {
                fresh: async () => {
                    await dataSource.getRepository(NoteEntity).clear();

                    return new DatabaseNoteRepository(dataSource);
                },
                close: () => dataSource.destroy(),
            };
        },
    },
    {
        name: 'its EntityRepositoryAdapter subclass on PostgreSQL (createTestDataSource with a url)',
        skip: !postgres,
        open: async () => {
            const {
                username,
                password,
                host,
                port,
            } = postgres!;
            const dataSource = await createTestDataSource({
                entities: [NoteEntity],
                url: `postgres://${username}:${password}@${host}:${port}/postgres`,
            });

            return {
                fresh: async () => {
                    await dataSource.getRepository(NoteEntity).clear();

                    return new DatabaseNoteRepository(dataSource);
                },
                close: () => dataSource.destroy(),
            };
        },
    },
];

function uuid(n: number): string {
    return `00000000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;
}

describe('an app\'s service runs on MemoryEntityRepository and on its EntityRepositoryAdapter subclass with the same spec', () => {
    describe.each(repositories)('on $name', ({ skip, open }) => {
        // one database per file, emptied before each test (a PostgreSQL database costs a CREATE and a DROP)
        let opened: Opened | undefined;

        beforeAll(async () => {
            opened = skip ? undefined : await open();
        });

        afterAll(async () => {
            await opened?.close();
        });

        async function service(): Promise<NoteService> {
            return new NoteService({ repository: await opened!.fresh() });
        }

        it.skipIf(skip)('creates, renames and lists notes with the same results', async () => {
            const notes = await service();

            for (const [n, title] of [[3, 'gamma'], [1, 'Alpha'], [2, 'alpha'], [4, 'beta']] as const) {
                await notes.create(uuid(n), title);
            }

            expect(await notes.rename(uuid(4), 0, 'delta')).toBe('renamed');
            expect(await notes.rename(uuid(4), 0, 'epsilon')).toBe('stale');
            expect(await notes.rename(uuid(9), 0, 'zeta')).toBe('missing');

            expect(await notes.list(defineQuery({ filters: eq('title', 'alpha') }))).toEqual({
                data: [{
                    id: uuid(2),
                    title: 'alpha',
                    version: 0,
                    dueAt: '2026-01-01T00:00:00.000Z',
                }],
                meta: { total: 1 },
            });
            expect(await notes.list(defineQuery({
                filters: inArray('version', [0, 1]),
                sorts: { version: 'DESC', id: 'DESC' },
                pagination: { limit: 2, offset: 1 },
            }))).toEqual({
                data: [{
                    id: uuid(3),
                    title: 'gamma',
                    version: 0,
                    dueAt: '2026-01-01T00:00:00.000Z',
                }, {
                    id: uuid(2),
                    title: 'alpha',
                    version: 0,
                    dueAt: '2026-01-01T00:00:00.000Z',
                }],
                meta: {
                    total: 4,
                    limit: 2,
                    offset: 1,
                },
            });
            expect((await notes.list(defineQuery({ filters: eq('id', 'no-uuid') }))).data).toEqual([]);
        });

        it.skipIf(skip)('a date range matches the same notes, whatever offset the request writes the instant in', async () => {
            const notes = await service();

            await notes.create(uuid(1), 'before', '2026-11-15T23:30:00.000Z');
            await notes.create(uuid(2), 'after', '2026-11-16T00:30:00.000Z');
            await notes.create(uuid(3), 'later', '2026-11-16T12:00:00.000Z');

            const ids = async (filters: ICondition) => (await notes.list(defineQuery({
                filters,
                sorts: { id: 'ASC' },
            }))).data.map((note) => note.id);

            expect(await ids(gte('dueAt', '2026-11-16T02:00:00+02:00'))).toEqual([uuid(2), uuid(3)]);
            expect(await ids(lt('dueAt', '2026-11-16T00:00:00Z'))).toEqual([uuid(1)]);
            expect(await ids(eq('dueAt', '2026-11-16T01:30:00+01:00'))).toEqual([uuid(2)]);
            expect(await ids(inArray('dueAt', ['2026-11-16T14:00:00+02:00']))).toEqual([uuid(3)]);

            // a value that names no instant is refused, whatever the operator
            for (const filter of [eq('dueAt', 'not-a-date'), ne('dueAt', 'not-a-date'), inArray('dueAt', ['2026-11-16T14:00:00+02:00', 'not-a-date'])]) {
                await expect(notes.list(defineQuery({ filters: filter }))).rejects.toBeInstanceOf(EntityQueryError);
            }

            expect((await notes.list(defineQuery({ filters: eq('id', uuid(2)) }))).data[0]?.dueAt).toBe('2026-11-16T00:30:00.000Z');
        });

        it.skipIf(skip)('a duplicate title is an EntityConflictError', async () => {
            const notes = await service();

            await notes.create(uuid(1), 'alpha');

            await expect(notes.create(uuid(2), 'alpha')).rejects.toBeInstanceOf(EntityConflictError);
        });

        it.skipIf(skip)('of two concurrent renames from one version exactly one wins', async () => {
            const notes = await service();
            const id = randomUUID();

            await notes.create(id, 'alpha');

            const results = await Promise.all([notes.rename(id, 0, 'beta'), notes.rename(id, 0, 'gamma')]);

            expect([...results].sort()).toEqual(['renamed', 'stale']);

            const [stored] = (await notes.list(defineQuery({ filters: eq('id', id) }))).data;

            expect(stored?.version).toBe(1);
            expect(stored?.title).toBe(results[0] === 'renamed' ? 'beta' : 'gamma');
        });
    });
});
