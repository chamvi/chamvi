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

export const ENTITY_CONFLICT_ERROR_INSTANCE = Symbol.for('@chamvi/errors/EntityConflictError');

/**
 * An insert met a stored row with the same key or a unique value. Carries
 * the entity's label only, never the conflicting value.
 */
export class EntityConflictError extends ChamviError {
    readonly entity: string | undefined;

    constructor(input?: string | ChamviEntityErrorOptions) {
        const options: ChamviEntityErrorOptions = typeof input === 'string' ? { message: input } : (input ?? {});
        const { entity, ...rest } = options;

        super({
            code: ErrorCode.ENTITY_CONFLICT,
            message: entity ? `The ${entity} conflicts with a stored ${entity}.` : 'Entity conflicts with a stored entity.',
            ...rest,
        });
        markInstanceof(this, ENTITY_CONFLICT_ERROR_INSTANCE);

        this.entity = entity;
    }
}
