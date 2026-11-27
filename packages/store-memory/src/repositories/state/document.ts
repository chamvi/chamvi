/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { defineQuery } from '@rapiq/core';
import { isEqual, isObject } from 'smob';
import type { EntityFindManyResult, IStateDocumentRepository, StateDocumentPage } from '@chamvi/store';
import type { StateDocument } from '@chamvi/core-kit';
import { MemoryEntityRepository } from '../../entity/module.ts';
import type { MemoryRepositoryOptions } from '../../entity/types.ts';

/**
 * Agent state documents in the registry (entity `state_document`, key
 * `id`, `(agent, collection, documentId)` unique), stored as given;
 * `upsert` replaces by `(agent, collection, documentId)`.
 */
export class MemoryStateDocumentRepository extends MemoryEntityRepository<StateDocument> implements IStateDocumentRepository {
    constructor(options: MemoryRepositoryOptions) {
        super({
            entity: 'state_document',
            registry: options.registry,
            key: ['id'],
            unique: [['agent', 'collection', 'documentId']],
            upsertKey: ['agent', 'collection', 'documentId'],
        });
    }

    async findContaining(
        agent: string,
        collection: string,
        where: Record<string, unknown>,
        page: StateDocumentPage,
    ): Promise<EntityFindManyResult<StateDocument>> {
        const entries = Object.entries(where);
        const query = defineQuery({
            sorts: { documentId: 'ASC' },
            pagination: {
                ...(page.limit !== undefined ? { limit: page.limit } : {}),
                ...(page.offset !== undefined ? { offset: page.offset } : {}),
            },
        });

        return this.findManyWhere(query, (row) => {
            if (row.agent !== agent || row.collection !== collection) {
                return false;
            }

            if (entries.length === 0) {
                return true;
            }

            const { doc } = row;

            return isObject(doc) && entries.every(([key, value]) => (value === undefined ?
                !Object.hasOwn(doc, key) || doc[key] === undefined :
                Object.hasOwn(doc, key) && isEqual(doc[key], value)));
        });
    }
}
