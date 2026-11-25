/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { uuidv7 } from 'uuidv7';
import { EntityConflictError } from '@chamvi/store';
import type { ILimitRepository } from '@chamvi/store';
import type { IClock } from '../clock/index.ts';
import { assertLimitKey, assertLimitUseWeight, assertLimitWindow } from './asserts.ts';
import { LIMIT_RETENTION_MS } from './constants.ts';
import type { ILimitService, LimitServiceContext } from './types.ts';

/**
 * The counted uses of tool limits over an `ILimitRepository`: one row per
 * `(scope, key)`, inserted if absent, stamped with the clock's time. A use
 * created at T counts in a window of `windowMs` until exactly
 * `T + windowMs`. A scope or key the store column cannot hold (over 255
 * characters, NUL) is a ValidationError.
 */
export class LimitService implements ILimitService {
    protected repository: ILimitRepository;

    protected clock: IClock;

    constructor(ctx: LimitServiceContext) {
        this.repository = ctx.repository;
        this.clock = ctx.clock;
    }

    async used(scope: string, windowMs: number): Promise<number> {
        assertLimitKey('scope', scope);
        assertLimitWindow(windowMs);

        return this.repository.sumWeight(scope, new Date(this.clock.now() - windowMs));
    }

    async has(scope: string, key: string): Promise<boolean> {
        assertLimitKey('scope', scope);
        assertLimitKey('key', key);

        return await this.repository.findOneBy({ scope, key }) !== null;
    }

    async record(scope: string, key: string, weight: number): Promise<void> {
        assertLimitKey('scope', scope);
        assertLimitKey('key', key);
        assertLimitUseWeight(weight);

        try {
            await this.repository.transaction(async (repository) => {
                await repository.save(repository.create({
                    id: uuidv7(),
                    scope,
                    key,
                    weight,
                    createdAt: new Date(this.clock.now()),
                }));
            });
        } catch (error) {
            // the call was counted already
            if (!(error instanceof EntityConflictError)) {
                throw error;
            }
        }
    }

    async purgeExpired(now: Date = new Date(this.clock.now())): Promise<number> {
        const before = new Date(now.getTime() - LIMIT_RETENTION_MS);

        return this.repository.transaction((repository) => repository.removeCreatedBefore(before));
    }
}
