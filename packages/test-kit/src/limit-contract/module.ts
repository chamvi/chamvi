/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    and,
    defineQuery,
    eq,
    gt,
} from '@rapiq/core';
import {
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import { EntityConflictError } from '@chamvi/store';
import type { ILimitRepository, LimitUse } from '@chamvi/store';
import { testUuid } from '../fixture/helpers.ts';
import type { LimitRepositoryContractInput } from './types.ts';

function useOf(label: string, scope: string, key: string, weight: number, expiresAt: number): LimitUse {
    return {
        id: testUuid(label),
        scope,
        key,
        weight,
        expiresAt: new Date(expiresAt),
    };
}

async function insert(uses: ILimitRepository, value: LimitUse): Promise<LimitUse> {
    return uses.save(uses.create(value));
}

function keysOf(rows: LimitUse[]): string[] {
    return rows.map((row) => row.key).sort();
}

/**
 * The storage behaviour of an `ILimitRepository`: uses stored as given,
 * the unique `(scope, key)`, `findMany` by scope and expiry,
 * `removeExpiredBy` and its boundary, copies, and concurrent first saves
 * of one key.
 */
export function describeLimitRepositoryContract(input: LimitRepositoryContractInput): void {
    describe(`limit use repository contract: ${input.name}`, () => {
        let uses: ILimitRepository;

        beforeEach(async () => {
            uses = await input.create();
        });

        it('stores a use as given and reads it back by id and by scope and key; save resolves the next read', async () => {
            const saved = await insert(uses, useOf('u1', 'a:send', 'r1:0:c1', 3, 61_000));

            expect(saved).toStrictEqual(useOf('u1', 'a:send', 'r1:0:c1', 3, 61_000));
            expect(saved.expiresAt).toBeInstanceOf(Date);
            expect(await uses.findOneById(testUuid('u1'))).toStrictEqual(saved);
            expect(await uses.findOneBy({ scope: 'a:send', key: 'r1:0:c1' })).toStrictEqual(saved);
        });

        it('reads an unknown use or a malformed id as null; the scope is part of the key', async () => {
            await insert(uses, useOf('u1', 'a:send', 'k', 1, 1_000));

            expect(await uses.findOneBy({ scope: 'b:send', key: 'k' })).toBeNull();
            expect(await uses.findOneById(testUuid('missing'))).toBeNull();
            expect(await uses.findOneById('not-a-uuid')).toBeNull();
        });

        it('stores one key in two scopes and two keys in one scope', async () => {
            await insert(uses, useOf('u1', 'a:send', 'k', 1, 1_000));
            await insert(uses, useOf('u2', 'b:send', 'k', 2, 1_000));
            await insert(uses, useOf('u3', 'a:send', 'other', 3, 1_000));

            expect((await uses.findOneBy({ scope: 'b:send', key: 'k' }))!.weight).toBe(2);
            expect((await uses.findOneBy({ scope: 'a:send', key: 'other' }))!.weight).toBe(3);
        });

        it('save of a created use whose scope and key are stored is EntityConflictError and leaves the stored row', async () => {
            await insert(uses, useOf('u1', 's', 'k', 1, 1_000));

            await expect(insert(uses, useOf('u2', 's', 'k', 2, 2_000))).rejects.toBeInstanceOf(EntityConflictError);
            expect(await uses.findOneBy({ scope: 's', key: 'k' })).toStrictEqual(useOf('u1', 's', 'k', 1, 1_000));
        });

        it('findMany filters by scope and by an expiry after a time, with the total', async () => {
            await insert(uses, useOf('u1', 's', 'before', 1, 4_999));
            await insert(uses, useOf('u2', 's', 'at', 1, 5_000));
            await insert(uses, useOf('u3', 's', 'after', 2, 5_001));
            await insert(uses, useOf('u4', 's', 'later', 3, 9_000));
            await insert(uses, useOf('u5', 'other', 'later', 4, 9_000));

            const live = await uses.findMany(defineQuery({ filters: and(eq('scope', 's'), gt('expiresAt', new Date(5_000))) }));

            expect(keysOf(live.data)).toEqual(['after', 'later']);
            expect(live.meta.total).toBe(2);
            expect(live.data.every((row) => row.scope === 's' && row.expiresAt instanceof Date)).toBe(true);

            const scoped = await uses.findMany(defineQuery({ filters: eq('scope', 's') }));

            expect(scoped.meta.total).toBe(4);
        });

        it('removeExpiredBy removes exactly the uses expired at the time and resolves how many', async () => {
            await insert(uses, useOf('u1', 's', 'before', 1, 4_999));
            await insert(uses, useOf('u2', 'other', 'at', 1, 5_000));
            await insert(uses, useOf('u3', 's', 'after', 1, 5_001));

            expect(await uses.removeExpiredBy(new Date(5_000))).toBe(2);
            expect(await uses.findOneBy({ scope: 's', key: 'before' })).toBeNull();
            expect(await uses.findOneBy({ scope: 'other', key: 'at' })).toBeNull();
            expect(await uses.findOneBy({ scope: 's', key: 'after' })).toStrictEqual(useOf('u3', 's', 'after', 1, 5_001));
            expect(await uses.removeExpiredBy(new Date(5_000))).toBe(0);
        });

        it('removeExpiredBy keeps a use a transaction in flight extends past the time', async () => {
            await insert(uses, useOf('u1', 's', 'k', 1, 1_000));

            const { promise: locked, resolve: lock } = Promise.withResolvers<void>();
            const { promise: release, resolve: done } = Promise.withResolvers<void>();
            const extending = uses.transaction(async (repository) => {
                const read = (await repository.findOneBy({ scope: 's', key: 'k' }))!;

                lock();
                await release;
                repository.merge(read, { expiresAt: new Date(9_000) });
                await repository.save(read);
            });

            await locked;

            const purge = uses.removeExpiredBy(new Date(5_000));

            // the purge waits for the row the transaction holds before it commits
            await input.untilBlocked();
            done();
            await extending;
            expect(await purge).toBe(0);
            expect(await uses.findOneBy({ scope: 's', key: 'k' })).toStrictEqual(useOf('u1', 's', 'k', 1, 9_000));
        });

        it('copies values in and out', async () => {
            const value = useOf('u1', 's', 'k', 1, 1_000);

            await insert(uses, value);
            value.expiresAt.setTime(9_000);
            value.weight = 7;

            const read = (await uses.findOneBy({ scope: 's', key: 'k' }))!;

            expect(read.expiresAt).toEqual(new Date(1_000));
            expect(read.weight).toBe(1);
            read.expiresAt.setTime(9_000);
            expect((await uses.findOneBy({ scope: 's', key: 'k' }))!.expiresAt).toEqual(new Date(1_000));
        });

        it('concurrent first saves of one key: exactly one is stored, the others are EntityConflictError', async () => {
            const results = await Promise.allSettled(Array.from({ length: 5 }, (_, i) => insert(uses, useOf(`u${i}`, 's', 'k', i + 1, 1_000))));
            const stored = results.findIndex((result) => result.status === 'fulfilled');

            expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
            expect(results.filter((result) => result.status === 'rejected')
                .every((result) => (result as PromiseRejectedResult).reason instanceof EntityConflictError)).toBe(true);
            expect((await uses.findOneBy({ scope: 's', key: 'k' }))!.weight).toBe(stored + 1);
        });
    });
}
