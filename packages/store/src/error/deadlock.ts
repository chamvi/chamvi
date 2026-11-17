/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { BaseError } from '@ebec/core';
import { StoreErrorCode } from './constants.ts';

/**
 * A transaction was chosen as the victim of a lock cycle (a database
 * deadlock, or a cycle of row locks in memory); nothing it wrote was kept.
 * Carries the entity's label only.
 */
export class EntityDeadlockError extends BaseError {
    readonly entity: string;

    constructor(entity: string) {
        super({
            message: `The ${entity} could not be written: the transaction deadlocked.`,
            code: StoreErrorCode.ENTITY_DEADLOCK,
        });

        this.entity = entity;
    }
}
