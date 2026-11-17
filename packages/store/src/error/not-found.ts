/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { BaseError } from '@ebec/core';
import { StoreErrorCode } from './constants.ts';

/**
 * A row the repository was asked for does not exist. Carries the entity's
 * label only, never the id or the query that missed.
 */
export class EntityNotFoundError extends BaseError {
    readonly entity: string;

    constructor(entity: string) {
        super({
            message: `The ${entity} was not found.`,
            code: StoreErrorCode.ENTITY_NOT_FOUND,
        });

        this.entity = entity;
    }
}
