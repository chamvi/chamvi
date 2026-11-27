/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { markInstanceof } from '@ebec/core';
import { ErrorCode } from '../constants.ts';
import { ChamviError } from '../module.ts';
import type { ChamviEntityErrorInput, ChamviEntityErrorOptions } from '../types.ts';

export const ENTITY_NOT_FOUND_ERROR_INSTANCE = Symbol.for('@chamvi/errors/EntityNotFoundError');

/**
 * A row the repository was asked for does not exist. Carries the entity's
 * label only, never the id or the query that missed.
 */
export class EntityNotFoundError extends ChamviError {
    readonly entity: string | undefined;

    constructor(input?: ChamviEntityErrorInput) {
        const options: ChamviEntityErrorOptions = typeof input === 'string' ? { message: input } : (input ?? {});
        const { entity, ...rest } = options;

        super({
            code: ErrorCode.ENTITY_NOT_FOUND,
            message: entity ? `The ${entity} was not found.` : 'Entity not found.',
            ...rest,
        });
        markInstanceof(this, ENTITY_NOT_FOUND_ERROR_INSTANCE);

        this.entity = entity;
    }
}
