/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { defineQuery } from '@rapiq/core';
import {
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import { EntityConflictError } from '@chamvi/store';
import type { IAgentRevisionRepository } from '@chamvi/store';
import type { AgentRevisionRecord } from '@chamvi/core-kit';
import { testUuid } from '../fixture/helpers.ts';
import type { AgentRevisionRepositoryContractInput } from './types.ts';

function record(agent: string, overrides: Partial<AgentRevisionRecord> = {}): AgentRevisionRecord {
    return {
        id: testUuid(`id:${agent}`),
        agent,
        hash: 'h1',
        changedAt: new Date(1_000),
        ...overrides,
    };
}

async function upsert(revisions: IAgentRevisionRepository, value: AgentRevisionRecord): Promise<AgentRevisionRecord> {
    return revisions.upsert(revisions.create(value));
}

/**
 * The storage behaviour of an `IAgentRevisionRepository`: markers stored
 * as given, `upsert` replacing by `agent` and keeping the stored id, the
 * unique agent, the code-point order of `agent`, copies and concurrent
 * upserts of one agent.
 */
export function describeAgentRevisionRepositoryContract(input: AgentRevisionRepositoryContractInput): void {
    describe(`agent revision repository contract: ${input.name}`, () => {
        let revisions: IAgentRevisionRepository;

        beforeEach(async () => {
            revisions = await input.create();
        });

        it('stores a marker as given and reads it back by agent and by id, changedAt a Date', async () => {
            await revisions.save(revisions.create(record('a')));

            const read = await revisions.findOneBy({ agent: 'a' });

            expect(read).toEqual(record('a'));
            expect(read!.changedAt).toBeInstanceOf(Date);
            expect(await revisions.findOneById(testUuid('id:a'))).toEqual(record('a'));
        });

        it('reads an unknown agent or a malformed id as null', async () => {
            expect(await revisions.findOneBy({ agent: 'missing' })).toBeNull();
            expect(await revisions.findOneById(testUuid('missing'))).toBeNull();
            expect(await revisions.findOneById('not-a-uuid')).toBeNull();
        });

        it('upsert inserts, then replaces hash and changedAt of the same agent and keeps the stored id; it resolves the next read', async () => {
            const first = await upsert(revisions, record('a'));

            expect(first).toStrictEqual(await revisions.findOneBy({ agent: 'a' }));
            expect(first).toStrictEqual(record('a'));

            const second = await upsert(revisions, record('a', {
                id: testUuid('other'),
                hash: 'h2',
                changedAt: new Date(2_000),
            }));

            expect(second).toStrictEqual(record('a', { hash: 'h2', changedAt: new Date(2_000) }));
            expect(second).toStrictEqual(await revisions.findOneBy({ agent: 'a' }));
            expect(await revisions.findOneById(testUuid('other'))).toBeNull();
            expect(await revisions.findManyBy({ agent: 'a' })).toHaveLength(1);
        });

        it('save of a created marker whose agent is stored is EntityConflictError and leaves the stored row', async () => {
            await revisions.save(revisions.create(record('a')));

            await expect(revisions.save(revisions.create(record('a', { id: testUuid('other'), hash: 'h2' }))))
                .rejects.toBeInstanceOf(EntityConflictError);
            expect(await revisions.findOneBy({ agent: 'a' })).toEqual(record('a'));
        });

        it('remove deletes the row; the other rows stay', async () => {
            await upsert(revisions, record('a'));
            await upsert(revisions, record('b'));

            await revisions.remove((await revisions.findOneBy({ agent: 'a' }))!);

            expect(await revisions.findOneBy({ agent: 'a' })).toBeNull();
            expect(await revisions.findOneBy({ agent: 'b' })).toEqual(record('b'));
        });

        it('sorts by agent in code-point order', async () => {
            for (const agent of ['b', 'a_b', 'a-b', 'a', 'B']) {
                await upsert(revisions, record(agent));
            }

            const { data, meta } = await revisions.findMany(defineQuery({ sorts: { agent: 'ASC' } }));

            expect(data.map((revision) => revision.agent)).toEqual(['B', 'a', 'a-b', 'a_b', 'b']);
            expect(meta.total).toBe(5);
        });

        it('copies values in and out', async () => {
            const value = record('a');

            await upsert(revisions, value);
            value.hash = 'evil';
            value.changedAt.setTime(0);

            const read = (await revisions.findOneBy({ agent: 'a' }))!;

            expect(read).toEqual(record('a'));
            read.hash = 'evil';
            read.changedAt.setTime(0);

            const { data: [listed] } = await revisions.findMany(defineQuery({}));

            expect(listed).toEqual(record('a'));
            listed!.changedAt.setTime(0);
            expect(await revisions.findOneBy({ agent: 'a' })).toEqual(record('a'));
        });

        it('concurrent upserts of one agent all resolve and leave one row holding one of their hashes', async () => {
            const results = await Promise.all(Array.from({ length: 20 }, (_, i) => upsert(revisions, record('a', {
                id: testUuid(`a${i}`),
                hash: `h${i}`,
            }))));
            const stored = (await revisions.findOneBy({ agent: 'a' }))!;

            expect(new Set(results.map((revision) => revision.id))).toEqual(new Set([stored.id]));
            expect(results.map((revision) => revision.hash)).toContain(stored.hash);
            expect(await revisions.findManyBy({ agent: 'a' })).toHaveLength(1);
        });
    });
}
