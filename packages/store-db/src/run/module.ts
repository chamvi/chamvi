/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IQuery } from '@rapiq/core';
import type { DataSource, EntityManager } from 'typeorm';
import type {
    EntityFindManyResult,
    IRunRepository,
    Run,
    WaitPoint,
} from '@chamvi/store';
import { ConversationEntity, RunEntity, StepEntity } from '../entities/index.ts';
import { EntityRepositoryAdapter } from '../entity/module.ts';
import { fromRunEntity, toRunEntity } from './helpers.ts';

/**
 * Runs in `chamvi_runs`, stored as given. A single-row read in a
 * transaction locks the row `FOR NO KEY UPDATE`: the inserts of rows that
 * reference a run (steps, checkpoints, child runs) take `FOR KEY SHARE`
 * on it, which `FOR UPDATE` would block behind every run update.
 */
export class DatabaseRunRepository extends EntityRepositoryAdapter<Run, RunEntity> implements IRunRepository {
    constructor(source: DataSource | EntityManager) {
        super(source.getRepository(RunEntity), {
            entity: 'run',
            alias: 'run',
            target: RunEntity,
            lock: 'no-key-update',
            toEntity: toRunEntity,
            fromEntity: fromRunEntity,
            fields: {
                'claim.owner': 'claimOwner',
                'claim.expiresAt': 'claimExpiresAt',
                'conversation.scope.id': 'conversationScopeId',
                'conversation.scope.generation': 'conversationGeneration',
                'conversation.text': 'conversationText',
            },
            related: [
                { target: ConversationEntity, entity: 'conversation' },
                { target: StepEntity, entity: 'step' },
            ],
        });
    }

    withManager(manager: EntityManager): this {
        return new DatabaseRunRepository(manager) as this;
    }

    async findByWaitKind(kind: WaitPoint['kind'], query: IQuery): Promise<EntityFindManyResult<Run>> {
        const column = this.metadata.findColumnWithPropertyName('waiting')!.databaseName;

        // a jsonb path: rapiq's TypeORM adapter cannot address one
        return this.findManyWhere(query, (queryBuilder, alias) => {
            queryBuilder.andWhere(`(${queryBuilder.escape(alias)}.${queryBuilder.escape(column)} ->> 'kind' = :waitKind)`, { waitKind: kind });
        });
    }
}
