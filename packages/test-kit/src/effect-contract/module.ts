/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import { EntityConflictError } from '@chamvi/store';
import type { EffectRecord, IEffectRepository } from '@chamvi/store';
import { testUuid } from '../fixture/helpers.ts';
import type { EffectRepositoryContractInput } from './types.ts';

async function upsert(effects: IEffectRepository, record: EffectRecord): Promise<EffectRecord> {
    return effects.upsert(effects.create(record));
}

/**
 * The storage behaviour of an `IEffectRepository`: results stored as
 * given, `upsert` replacing by `key` and keeping the stored id, the unique
 * key, copies and concurrent upserts of one key.
 */
export function describeEffectRepositoryContract(input: EffectRepositoryContractInput): void {
    describe(`effect repository contract: ${input.name}`, () => {
        let effects: IEffectRepository;

        beforeEach(async () => {
            effects = await input.create();
        });

        it('stores a result as given and reads it back by key and by id; falsy results are present', async () => {
            const nested = {
                ok: true,
                list: [1, 'two', null],
                at: '2026-01-01T00:00:00.000Z',
            };

            await effects.save(effects.create({
                id: testUuid('e1'),
                key: 'run:post:1',
                result: nested,
            }));

            expect(await effects.findOneBy({ key: 'run:post:1' })).toEqual({
                id: testUuid('e1'),
                key: 'run:post:1',
                result: nested,
            });
            expect(await effects.findOneById(testUuid('e1'))).toEqual({
                id: testUuid('e1'),
                key: 'run:post:1',
                result: nested,
            });

            for (const [index, result] of [null, false, 0, ''].entries()) {
                await effects.save(effects.create({
                    id: testUuid(`f${index}`),
                    key: `falsy:${index}`,
                    result,
                }));
                expect((await effects.findOneBy({ key: `falsy:${index}` }))!.result).toBe(result);
            }
        });

        it('reads an unknown key or a malformed id as null', async () => {
            expect(await effects.findOneBy({ key: 'missing' })).toBeNull();
            expect(await effects.findOneById(testUuid('missing'))).toBeNull();
            expect(await effects.findOneById('not-a-uuid')).toBeNull();
        });

        it('upsert inserts, then replaces the result of the same key and keeps the stored id; it resolves the next read', async () => {
            const first = await upsert(effects, {
                id: testUuid('e1'),
                key: 'k',
                result: { n: 1 },
            });

            expect(first).toStrictEqual(await effects.findOneBy({ key: 'k' }));

            const second = await upsert(effects, {
                id: testUuid('e2'),
                key: 'k',
                result: { n: 2 },
            });

            expect(second).toStrictEqual({
                id: testUuid('e1'),
                key: 'k',
                result: { n: 2 },
            });
            expect(second).toStrictEqual(await effects.findOneBy({ key: 'k' }));
            expect(await effects.findOneById(testUuid('e2'))).toBeNull();
            expect(await upsert(effects, {
                id: testUuid('e3'),
                key: 'other',
                result: null,
            })).toStrictEqual({
                id: testUuid('e3'),
                key: 'other',
                result: null,
            });
        });

        it('save of a created effect whose key is stored is EntityConflictError and leaves the stored row', async () => {
            await effects.save(effects.create({
                id: testUuid('e1'),
                key: 'k',
                result: 'first',
            }));

            await expect(effects.save(effects.create({
                id: testUuid('e2'),
                key: 'k',
                result: 'second',
            })))
                .rejects.toBeInstanceOf(EntityConflictError);
            expect(await effects.findOneBy({ key: 'k' })).toEqual({
                id: testUuid('e1'),
                key: 'k',
                result: 'first',
            });
        });

        it('copies values in and out', async () => {
            const result = { list: [1] };

            await upsert(effects, {
                id: testUuid('e1'),
                key: 'k',
                result,
            });
            result.list.push(2);

            const read = (await effects.findOneBy({ key: 'k' }))!;

            expect(read.result).toEqual({ list: [1] });
            (read.result as { list: number[] }).list.push(3);
            expect((await effects.findOneBy({ key: 'k' }))!.result).toEqual({ list: [1] });
        });

        it('concurrent upserts of one key all resolve and leave one row holding one of their results', async () => {
            const results = await Promise.all(Array.from({ length: 20 }, (_, i) => upsert(effects, {
                id: testUuid(`e${i}`),
                key: 'k',
                result: i,
            })));
            const stored = (await effects.findOneBy({ key: 'k' }))!;

            expect(new Set(results.map((record) => record.id))).toEqual(new Set([stored.id]));
            expect(results.map((record) => record.result)).toContain(stored.result);
        });
    });
}
