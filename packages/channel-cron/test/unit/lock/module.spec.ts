/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import type { ILockService } from '@chamvi/core';
import { createRepositoryScheduleLock } from '@chamvi/channel-cron';
import { ControllableClock, createTestEngine } from '@chamvi/test-kit';

const setup = () => {
    const clock = new ControllableClock(new Date('2026-03-01T08:00:00.000Z'));
    const { lockService } = createTestEngine({ agents: [], clock });

    return { clock, lockService };
};

describe('createRepositoryScheduleLock', () => {
    it('first acquirer of a tick wins', async () => {
        const { lockService } = setup();
        const a = createRepositoryScheduleLock(lockService, 'a');
        const b = createRepositoryScheduleLock(lockService, 'b');

        expect(await a.acquire('cron:x:y:T', 600_000)).toBe(true);
        expect(await b.acquire('cron:x:y:T', 600_000)).toBe(false);
    });

    it('different ticks do not block each other', async () => {
        const { lockService } = setup();
        const lock = createRepositoryScheduleLock(lockService, 'a');

        expect(await lock.acquire('cron:x:y:T1', 600_000)).toBe(true);
        expect(await lock.acquire('cron:x:y:T2', 600_000)).toBe(true);
    });

    it('the lock is never released', async () => {
        const { clock, lockService } = setup();
        const lock = createRepositoryScheduleLock(lockService, 'a');
        const other = createRepositoryScheduleLock(lockService, 'b');

        expect('release' in lock).toBe(false);
        expect(await lock.acquire('k', 600_000)).toBe(true);
        clock.advance(599_999);
        expect(await other.acquire('k', 600_000)).toBe(false);
        clock.advance(1);
        expect(await other.acquire('k', 600_000)).toBe(true);
    });

    it('passes the owner to the lock service', async () => {
        const calls: [string, string, number][] = [];
        const locks: Pick<ILockService, 'acquire'> = {
            async acquire(key, owner, ttlMs) {
                calls.push([key, owner, ttlMs]);

                return true;
            },
        };

        await createRepositoryScheduleLock(locks, 'replica-1').acquire('k', 1000);

        expect(calls).toEqual([['k', 'replica-1', 1000]]);
    });
});
