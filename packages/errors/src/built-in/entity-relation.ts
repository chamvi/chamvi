/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { markInstanceof } from '@ebec/core';
import { ErrorCode } from '../constants.ts';
import { ChamviError } from '../module.ts';
import type { ChamviEntityErrorInput, ChamviEntityRelationErrorOptions } from '../types.ts';

export const ENTITY_RELATION_ERROR_INSTANCE = Symbol.for('@chamvi/errors/EntityRelationError');

/**
 * A write references a row of another entity that does not exist.
 * `relation` is the label of the referenced entity, never its id.
 */
export class EntityRelationError extends ChamviError {
    readonly entity: string | undefined;

    readonly relation: string | undefined;

    constructor(input?: ChamviEntityErrorInput<ChamviEntityRelationErrorOptions>) {
        const options: ChamviEntityRelationErrorOptions = typeof input === 'string' ? { message: input } : (input ?? {});
        const {
            entity,
            relation,
            ...rest
        } = options;

        super({
            code: ErrorCode.ENTITY_RELATION_INVALID,
            message: entity && relation ? `The ${entity}'s ${relation} does not exist.` : 'Entity relation does not exist.',
            ...rest,
        });
        markInstanceof(this, ENTITY_RELATION_ERROR_INSTANCE);

        this.entity = entity;
        this.relation = relation;
    }
}
