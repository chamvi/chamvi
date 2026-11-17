/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { BaseError } from '@ebec/core';
import { StoreErrorCode } from './constants.ts';

/**
 * A write holds a value the table's rules refuse: a missing required
 * column, a failed check, a value too long or of the wrong type. Not
 * retryable. Carries the entity's label, the operation and, when the
 * storage names one, the column or constraint (an identifier); never
 * the value, a statement or a connection URL.
 */
export class EntityInvalidError extends BaseError {
    readonly entity: string;

    /** The repository operation that was refused, e.g. `save`. */
    readonly operation: string;

    /** The column or constraint the storage named, if it named one. */
    readonly field: string | undefined;

    constructor(entity: string, operation: string, field?: string) {
        super({
            message: `The ${entity} holds a value its table refuses (${operation}${field ? `, ${field}` : ''}).`,
            code: StoreErrorCode.ENTITY_INVALID,
        });

        this.entity = entity;
        this.operation = operation;
        this.field = field;
    }
}
