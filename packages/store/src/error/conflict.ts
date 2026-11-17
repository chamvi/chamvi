/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { BaseError } from '@ebec/core';
import { StoreErrorCode } from './constants.ts';

/**
 * An insert met a stored row with the same key or a unique value. Carries
 * the entity's label only, never the conflicting value.
 */
export class EntityConflictError extends BaseError {
    readonly entity: string;

    constructor(entity: string) {
        super({
            message: `The ${entity} conflicts with a stored ${entity}.`,
            code: StoreErrorCode.ENTITY_CONFLICT,
        });

        this.entity = entity;
    }
}
