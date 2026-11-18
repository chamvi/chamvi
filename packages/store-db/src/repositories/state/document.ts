/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { and, defineQuery, eq } from '@rapiq/core';
import { JsonContains } from 'typeorm';
import type { DataSource, EntityManager } from 'typeorm';
import type {
    EntityFindManyResult,
    IStateDocumentRepository,
    StateDocument,
    StateDocumentPage,
} from '@chamvi/store';
import { DocEntity } from '../../entities/index.ts';
import { toJsonParameter } from '../../entities/helpers.ts';
import { EntityRepositoryAdapter } from '../../entity/module.ts';

/**
 * Agent state documents in `chamvi_docs` (`document_id` `COLLATE "C"`),
 * stored as given; `upsert` replaces by `(agent, collection, documentId)`.
 */
export class DatabaseStateDocumentRepository extends EntityRepositoryAdapter<StateDocument, DocEntity> implements IStateDocumentRepository {
    constructor(source: DataSource | EntityManager) {
        super(source.getRepository(DocEntity), {
            entity: 'state_document',
            alias: 'document',
            target: DocEntity,
            upsertKey: ['agent', 'collection', 'documentId'],
        });
    }

    withManager(manager: EntityManager): this {
        return new DatabaseStateDocumentRepository(manager) as this;
    }

    async findContaining(
        agent: string,
        collection: string,
        where: Record<string, unknown>,
        page: StateDocumentPage,
    ): Promise<EntityFindManyResult<StateDocument>> {
        const query = defineQuery({
            filters: and(eq('agent', agent), eq('collection', collection)),
            sorts: { documentId: 'ASC' },
            pagination: {
                ...(page.limit !== undefined ? { limit: page.limit } : {}),
                ...(page.offset !== undefined ? { offset: page.offset } : {}),
            },
        });
        const entries = Object.entries(where);

        if (entries.length === 0) {
            return this.findManyWhere(query);
        }

        const column = this.metadata.findColumnWithPropertyName('doc')!.databaseName;

        return this.findManyWhere(query, (queryBuilder, alias) => {
            const doc = `${queryBuilder.escape(alias)}.${queryBuilder.escape(column)}`;
            const defined: Record<string, unknown> = {};

            for (const [index, [key, value]] of entries.entries()) {
                if (value === undefined) {
                    // raw: TypeORM has no operator for jsonb key existence (?)
                    queryBuilder.andWhere(`NOT jsonb_exists(${doc}, :whereKey${index})`, { [`whereKey${index}`]: key });

                    continue;
                }

                defined[key] = value;
                // raw: TypeORM has no operator for a jsonb path; equal at the top level, not only contained
                queryBuilder.andWhere(`(${doc} -> :whereKey${index}) = CAST(:whereValue${index} AS jsonb)`, {
                    [`whereKey${index}`]: key,
                    [`whereValue${index}`]: JSON.stringify(toJsonParameter(value)),
                });
            }

            // containment restricts to object documents and lets the GIN index narrow the rows
            queryBuilder.andWhere({ doc: JsonContains(defined) });
        });
    }
}
