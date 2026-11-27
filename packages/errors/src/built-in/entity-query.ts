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

export const ENTITY_QUERY_ERROR_INSTANCE = Symbol.for('@chamvi/errors/EntityQueryError');

/**
 * A request the repository refuses before it reaches the storage: a where
 * with a property set to `undefined`, a remove without a condition, or an
 * operation the entity does not offer (an upsert of append-only steps).
 * Carries the entity's label only, never a field or a value.
 */
export class EntityQueryError extends ChamviError {
    readonly entity: string | undefined;

    constructor(input?: string | ChamviEntityErrorOptions) {
        const options: ChamviEntityErrorOptions = typeof input === 'string' ? { message: input } : (input ?? {});
        const { entity, ...rest } = options;

        super({
            code: ErrorCode.ENTITY_QUERY_INVALID,
            message: entity ? `The ${entity} request is not valid.` : 'Entity request is not valid.',
            ...rest,
        });
        markInstanceof(this, ENTITY_QUERY_ERROR_INSTANCE);

        this.entity = entity;
    }
}
