/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { BaseError } from '@ebec/core';
import { StoreErrorCode } from './constants.ts';

/**
 * A request the repository refuses before it reaches the storage: a where
 * with a property set to `undefined`, a remove without a condition, or an
 * operation the entity does not offer (an upsert of append-only steps).
 * Carries the entity's label only, never a field or a value.
 */
export class EntityQueryError extends BaseError {
    readonly entity: string;

    constructor(entity: string) {
        super({
            message: `The ${entity} request is not valid.`,
            code: StoreErrorCode.ENTITY_QUERY_INVALID,
        });

        this.entity = entity;
    }
}
