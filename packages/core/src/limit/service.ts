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
import { uuidv7 } from 'uuidv7';
import { EntityConflictError } from '@chamvi/store';
import type { ILimitRepository } from '@chamvi/store';
import type { IClock } from '../clock/index.ts';
import { assertLimitKey } from './asserts.ts';
import type { ILimitService, LimitServiceContext } from './types.ts';

/**
 * The counted uses of tool limits over an `ILimitRepository`: one row per
 * `(scope, key)`, inserted if absent. A use recorded at T with `windowMs`
 * expires at exactly `T + windowMs`. A scope or key the store column
 * cannot hold (over 255 characters, NUL) is a ValidationError.
 */
export class LimitService implements ILimitService {
    protected repository: ILimitRepository;

    protected clock: IClock;

    constructor(ctx: LimitServiceContext) {
        this.repository = ctx.repository;
        this.clock = ctx.clock;
    }

    async used(scope: string): Promise<number> {
        assertLimitKey('scope', scope);

        const filters = and(eq('scope', scope), gt('expiresAt', new Date(this.clock.now())));
        const { data } = await this.repository.findMany(defineQuery({ filters }));

        return data.reduce((sum, use) => sum + use.weight, 0);
    }

    async counted(scope: string, key: string): Promise<boolean> {
        assertLimitKey('scope', scope);
        assertLimitKey('key', key);

        return await this.repository.findOneBy({ scope, key }) !== null;
    }

    async record(scope: string, key: string, weight: number, windowMs: number): Promise<void> {
        assertLimitKey('scope', scope);
        assertLimitKey('key', key);

        try {
            await this.repository.transaction(async (repository) => {
                await repository.save(repository.create({
                    id: uuidv7(),
                    scope,
                    key,
                    weight,
                    expiresAt: new Date(this.clock.now() + windowMs),
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
        return this.repository.transaction((repository) => repository.removeExpiredBy(now));
    }
}
