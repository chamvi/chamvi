/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/errors';
import {
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import { MemoryLimitRepository, MemoryRegistry } from '@chamvi/store-memory';
import {
    APPROVAL_TIMEOUT_MAX_MS,
    type ILimitService,
    LIMIT_LOCK_RETRY_MS,
    LIMIT_LOCK_TTL_MS,
    LimitService,
} from '../../../src/index.ts';
import { ControllableClock } from '../../utils/clock.ts';

describe('LimitService', () => {
    let clock: ControllableClock;
    let repository: MemoryLimitRepository;
    let limits: ILimitService;

    beforeEach(() => {
        clock = new ControllableClock(new Date(10_000));
        repository = new MemoryLimitRepository({ registry: new MemoryRegistry() });
        limits = new LimitService({ repository, clock });
    });

    it('exports the lock constants of the limit check', () => {
        expect(LIMIT_LOCK_TTL_MS).toBe(10_000);
        expect(LIMIT_LOCK_RETRY_MS).toBe(100);
    });

    it('used() is 0 for a scope without uses', async () => {
        expect(await limits.used('a:search', 1_000)).toBe(0);
    });

    it('used() sums the weights of the uses of the scope only in the window', async () => {
        await limits.record('a:search', 'r1:0:c1', 1);
        clock.advance(2_000);
        await limits.record('a:search', 'r1:0:c2', 3);
        await limits.record('a:other', 'r1:0:c3', 7);

        expect(await limits.used('a:search', 1_000)).toBe(3);
        expect(await limits.used('a:search', 5_000)).toBe(4);
        expect(await limits.used('a:other', 1_000)).toBe(7);
    });

    it('used() refuses a window a limit cannot have', async () => {
        for (const windowMs of [0, -1, 1.5, NaN, APPROVAL_TIMEOUT_MAX_MS + 1]) {
            await expect(limits.used('a:search', windowMs)).rejects.toBeInstanceOf(ValidationError);
        }
    });

    it('has() tells a stored use of the scope and key, whatever its age', async () => {
        expect(await limits.has('a:search', 'r1:0:c1')).toBe(false);

        await limits.record('a:search', 'r1:0:c1', 1);

        expect(await limits.has('a:search', 'r1:0:c1')).toBe(true);
        expect(await limits.has('a:other', 'r1:0:c1')).toBe(false);
        expect(await limits.has('a:search', 'r1:0:c2')).toBe(false);

        clock.advance(60 * 60 * 1000);

        expect(await limits.has('a:search', 'r1:0:c1')).toBe(true);
        await expect(limits.has('a:search', 'k'.repeat(256))).rejects.toThrow(ValidationError);
        await expect(limits.has('s\0', 'k')).rejects.toThrow(ValidationError);
    });

    it('record() refuses a weight the store cannot hold, writing nothing', async () => {
        for (const weight of [0, -1, 0.5, NaN, 2 ** 31]) {
            await expect(limits.record('a:search', 'r1:0:c1', weight)).rejects.toBeInstanceOf(ValidationError);
        }

        expect(await limits.used('a:search', 1_000)).toBe(0);
    });

    it('record() stores a uuid row created at the clock\'s time', async () => {
        await limits.record('a:search', 'r1:0:c1', 2);

        const row = await repository.findOneBy({ scope: 'a:search', key: 'r1:0:c1' });

        expect(row).toMatchObject({
            scope: 'a:search',
            key: 'r1:0:c1',
            weight: 2,
            createdAt: new Date(10_000),
        });
        expect(row!.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
    });

    it('a use leaves a window at exactly its creation time + windowMs: counted a millisecond before, not at it', async () => {
        await limits.record('a:search', 'r1:0:c1', 2);

        clock.advance(999);
        expect(await limits.used('a:search', 1_000)).toBe(2);
        clock.advance(1);
        expect(await limits.used('a:search', 1_000)).toBe(0);
        expect(await limits.used('a:search', 1_001)).toBe(2);
    });

    it('record() twice with one key counts once: the second call is no error and changes nothing', async () => {
        await limits.record('a:search', 'r1:0:c1', 2);
        clock.advance(500);
        await expect(limits.record('a:search', 'r1:0:c1', 5)).resolves.toBeUndefined();

        expect(await limits.used('a:search', 1_000)).toBe(2);
        expect(await repository.findOneBy({ scope: 'a:search', key: 'r1:0:c1' })).toMatchObject({ weight: 2, createdAt: new Date(10_000) });
    });

    it('record() counts one key once per scope: the same key in another scope counts there', async () => {
        await limits.record('a:search', 'r1:0:c1', 1);
        await limits.record('a:fetch', 'r1:0:c1', 1);

        expect(await limits.used('a:search', 1_000)).toBe(1);
        expect(await limits.used('a:fetch', 1_000)).toBe(1);
    });

    it('purgeExpired() keeps every use the longest window still counts and resolves how many it deleted', async () => {
        await limits.record('a:search', 'k1', 1);
        clock.advance(1_000);
        await limits.record('a:search', 'k2', 1);
        clock.advance(1_000);
        await limits.record('a:search', 'k3', 1);

        // the longest window ends a millisecond before k1 is gone
        clock.advance(APPROVAL_TIMEOUT_MAX_MS - 2_000 - 1);
        expect(await limits.purgeExpired()).toBe(0);
        expect(await limits.used('a:search', APPROVAL_TIMEOUT_MAX_MS)).toBe(3);

        clock.advance(1_001);
        expect(await limits.purgeExpired()).toBe(2);
        expect(await repository.findOneBy({ scope: 'a:search', key: 'k3' })).not.toBeNull();
        expect(await limits.purgeExpired(new Date(12_000 + APPROVAL_TIMEOUT_MAX_MS))).toBe(1);
    });

    it('a key whose use was purged counts again', async () => {
        await limits.record('a:search', 'k1', 1);
        clock.advance(APPROVAL_TIMEOUT_MAX_MS);
        await limits.purgeExpired();
        await limits.record('a:search', 'k1', 1);

        expect(await limits.used('a:search', 1_000)).toBe(1);
    });

    it.each([
        ['a scope longer than 255 characters', 'x'.repeat(256), 'k'],
        ['a scope with NUL', 'a:\0', 'k'],
        ['a key longer than 255 characters', 'a:search', 'k'.repeat(256)],
        ['a key with NUL', 'a:search', 'k\0'],
    ])('record() refuses %s with a ValidationError and stores nothing', async (_, scope, key) => {
        await expect(limits.record(scope, key, 1)).rejects.toBeInstanceOf(ValidationError);
        expect((await repository.findManyBy({})).length).toBe(0);
    });

    it.each([
        ['longer than 255 characters', 'x'.repeat(256)],
        ['with NUL', 'a:\0'],
    ])('used() refuses a scope %s with a ValidationError', async (_, scope) => {
        await expect(limits.used(scope, 1_000)).rejects.toBeInstanceOf(ValidationError);
    });

    it('takes a scope and a key of exactly 255 characters', async () => {
        const scope = 's'.repeat(255);

        await limits.record(scope, 'k'.repeat(255), 1);

        expect(await limits.used(scope, 1_000)).toBe(1);
    });
});
