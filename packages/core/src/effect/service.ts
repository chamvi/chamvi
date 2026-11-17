/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { uuidv7 } from 'uuidv7';
import type { IEffectRepository } from '@chamvi/store';
import { RepositoryNotFoundError } from '../errors/index.ts';
import { readEffect } from './helpers.ts';
import type { EffectResult, EffectServiceContext } from './types.ts';

/**
 * Recorded effect results over an `IEffectRepository`: one result per
 * effect key, replaced by a later save of the same key.
 */
export class EffectService {
    protected repository: IEffectRepository;

    constructor(ctx: EffectServiceContext) {
        this.repository = ctx.repository;
    }

    async findOne(key: string): Promise<EffectResult | undefined> {
        const record = await this.repository.findOneBy({ key });

        return record ? readEffect(record) : undefined;
    }

    /** As `findOne`; RepositoryNotFoundError when the key holds no result. */
    async findOneOrFail(key: string): Promise<EffectResult> {
        const effect = await this.findOne(key);

        if (!effect) {
            throw new RepositoryNotFoundError('effects');
        }

        return effect;
    }

    /** Records `result` under `key`, replacing a stored one; `undefined` is stored as `null`. */
    async save(key: string, result: unknown): Promise<EffectResult> {
        const stored = await this.repository.transaction((repository) => repository.upsert(repository.create({
            id: uuidv7(),
            key,
            result: result ?? null,
        })));

        return readEffect(stored);
    }
}
