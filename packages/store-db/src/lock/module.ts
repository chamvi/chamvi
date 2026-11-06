/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { uuidv7 } from 'uuidv7';
import { systemClock } from '@chamvi/core';
import type { IClock, ILockRepository } from '@chamvi/core';
import { LessThanOrEqual } from 'typeorm';
import type { DataSource, Repository } from 'typeorm';
import { LockEntity } from '../entities/index.ts';
import type { DatabaseStoreOptions } from '../repository/types.ts';

export class DatabaseLockRepository implements ILockRepository {
    protected dataSource: DataSource;

    protected clock: IClock;

    constructor(opts: DatabaseStoreOptions) {
        this.dataSource = opts.dataSource;
        this.clock = opts.clock ?? systemClock;
    }

    protected now(): Date {
        return this.clock.now();
    }

    protected get locks(): Repository<LockEntity> {
        return this.dataSource.getRepository(LockEntity);
    }

    async acquire(key: string, owner: string, ttlMs: number): Promise<boolean> {
        const now = this.now();
        const result = await this.locks.createQueryBuilder()
            .insert()
            .values({
                id: uuidv7(),
                key,
                owner,
                expiresAt: new Date(now.getTime() + ttlMs),
            })
            .orUpdate(
                ['owner', 'expires_at'],
                ['key'],
                { overwriteCondition: { where: { expiresAt: LessThanOrEqual(now) } } },
            )
            .returning(['key'])
            .updateEntity(false)
            .execute();

        return result.raw.length === 1;
    }

    /**
     * Locks the lease row first, then reads the clock: a renew that waited for
     * the row past the expiry is refused, never extended from an earlier reading.
     */
    async renew(key: string, owner: string, ttlMs: number): Promise<boolean> {
        return this.dataSource.transaction(async (manager) => {
            const locks = manager.withRepository(this.locks);
            const lease = await locks.findOne({
                where: { key, owner },
                lock: { mode: 'pessimistic_write' },
            });
            const now = this.now();

            if (!lease || lease.expiresAt.getTime() <= now.getTime()) {
                return false;
            }

            await locks.update({ key, owner }, { expiresAt: new Date(now.getTime() + ttlMs) });

            return true;
        });
    }

    async release(key: string, owner: string): Promise<void> {
        await this.locks.delete({ key, owner });
    }

    /** Delete rows expired at the supplied time (default: the clock). */
    async purgeExpired(now: Date = this.now()): Promise<number> {
        const result = await this.locks.delete({ expiresAt: LessThanOrEqual(now) });

        return result.affected ?? 0;
    }
}
