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
import { MemoryEffectRepository, MemoryRegistry } from '@chamvi/store-memory';
import { EffectService, RepositoryNotFoundError } from '../../../src/index.ts';

describe('EffectService', () => {
    let repository: MemoryEffectRepository;
    let effects: EffectService;

    beforeEach(() => {
        repository = new MemoryEffectRepository({ registry: new MemoryRegistry() });
        effects = new EffectService({ repository });
    });

    it('reads an unknown key as undefined; findOneOrFail throws RepositoryNotFoundError with today\'s message', async () => {
        expect(await effects.findOne('missing')).toBeUndefined();

        const error = await effects.findOneOrFail('missing').catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(RepositoryNotFoundError);
        expect(error).toMatchObject({ code: 'repository_not_found', message: (new RepositoryNotFoundError('effects')).message });
    });

    it('records a result and returns from save what the next read returns; a later save of the key replaces it', async () => {
        const saved = await effects.save('k', { ok: true });

        expect(saved).toStrictEqual({ result: { ok: true } });
        expect(await effects.findOne('k')).toStrictEqual(saved);
        expect(await effects.save('k', { ok: false })).toStrictEqual({ result: { ok: false } });
        expect(await effects.findOneOrFail('k')).toStrictEqual({ result: { ok: false } });
        expect(await repository.findManyBy({ key: 'k' })).toHaveLength(1);
    });

    it('stores an undefined result as null and keeps falsy results present', async () => {
        expect(await effects.save('u', undefined)).toStrictEqual({ result: null });
        expect(await effects.findOne('u')).toStrictEqual({ result: null });

        for (const value of [null, false, 0, '']) {
            await effects.save('falsy', value);
            expect(await effects.findOneOrFail('falsy')).toStrictEqual({ result: value });
        }
    });

    it('gives each stored key a uuid v7 storage id, kept by later saves', async () => {
        await effects.save('k', 1);

        const { id } = (await repository.findOneBy({ key: 'k' }))!;

        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        await effects.save('k', 2);
        expect((await repository.findOneBy({ key: 'k' }))!.id).toBe(id);
    });

    it('concurrent saves of one key all resolve and leave one result', async () => {
        const results = await Promise.all(Array.from({ length: 20 }, (_, i) => effects.save('k', i)));

        expect(results.map((result) => result.result)).toEqual(Array.from({ length: 20 }, (_, i) => i));
        expect(await repository.findManyBy({ key: 'k' })).toHaveLength(1);
    });

    it('copies results in and out', async () => {
        const result = { list: [1] };

        await effects.save('k', result);
        result.list.push(2);

        const read = (await effects.findOne('k'))!;

        expect(read.result).toEqual({ list: [1] });
        (read.result as { list: number[] }).list.push(3);
        expect(await effects.findOne('k')).toEqual({ result: { list: [1] } });
    });
});
