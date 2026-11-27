/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { markInstanceof } from '@ebec/core';
import { ErrorCode } from '../constants.ts';
import { ChamviError } from '../module.ts';
import type { ChamviEntityInvalidErrorOptions } from '../types.ts';

export const ENTITY_INVALID_ERROR_INSTANCE = Symbol.for('@chamvi/errors/EntityInvalidError');

/**
 * A write holds a value the table's rules refuse: a missing required
 * column, a failed check, a value too long or of the wrong type. Not
 * retryable. Carries the entity's label, the operation and, when the
 * storage names one, the column or constraint (an identifier); never
 * the value, a statement or a connection URL.
 */
export class EntityInvalidError extends ChamviError {
    readonly entity: string | undefined;

    /** The repository operation that was refused, e.g. `save`. */
    readonly operation: string | undefined;

    /** The column or constraint the storage named, if it named one. */
    readonly field: string | undefined;

    constructor(input?: string | ChamviEntityInvalidErrorOptions) {
        const options: ChamviEntityInvalidErrorOptions = typeof input === 'string' ? { message: input } : (input ?? {});
        const {
            entity,
            operation,
            field,
            ...rest
        } = options;

        super({
            code: ErrorCode.ENTITY_INVALID,
            message: entity && operation ?
                `The ${entity} holds a value its table refuses (${operation}${field ? `, ${field}` : ''}).` :
                'Entity holds a value its table refuses.',
            ...rest,
        });
        markInstanceof(this, ENTITY_INVALID_ERROR_INSTANCE);

        this.entity = entity;
        this.operation = operation;
        this.field = field;
    }
}
