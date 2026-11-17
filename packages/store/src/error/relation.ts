/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { BaseError } from '@ebec/core';
import { StoreErrorCode } from './constants.ts';

/**
 * A write references a row of another entity that does not exist.
 * `relation` is the label of the referenced entity, never its id.
 */
export class EntityRelationError extends BaseError {
    readonly entity: string;

    readonly relation: string;

    constructor(entity: string, relation: string) {
        super({
            message: `The ${entity}'s ${relation} does not exist.`,
            code: StoreErrorCode.ENTITY_RELATION_INVALID,
        });

        this.entity = entity;
        this.relation = relation;
    }
}
