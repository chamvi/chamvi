/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { markInstanceof } from '@ebec/core';
import { ErrorCode } from '../constants.ts';
import { ChamviError } from '../module.ts';
import type { ChamviEntityErrorOptions } from '../types.ts';

export const ENTITY_DEADLOCK_ERROR_INSTANCE = Symbol.for('@chamvi/errors/EntityDeadlockError');

/**
 * A transaction was chosen as the victim of a lock cycle (a database
 * deadlock, or a cycle of row locks in memory); nothing it wrote was kept.
 * Carries the entity's label only.
 */
export class EntityDeadlockError extends ChamviError {
    readonly entity: string | undefined;

    constructor(input?: string | ChamviEntityErrorOptions) {
        const options: ChamviEntityErrorOptions = typeof input === 'string' ? { message: input } : (input ?? {});
        const { entity, ...rest } = options;

        super({
            code: ErrorCode.ENTITY_DEADLOCK,
            message: entity ? `The ${entity} could not be written: the transaction deadlocked.` : 'Entity could not be written: the transaction deadlocked.',
            ...rest,
        });
        markInstanceof(this, ENTITY_DEADLOCK_ERROR_INSTANCE);

        this.entity = entity;
    }
}
