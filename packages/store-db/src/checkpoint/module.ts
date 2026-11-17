/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource, DeepPartial, EntityManager } from 'typeorm';
import type { CheckpointRecord, ICheckpointRepository } from '@chamvi/store';
import { CheckpointEntity, ConversationEntity, RunEntity } from '../entities/index.ts';
import { EntityRepositoryAdapter } from '../entity/module.ts';

/** The columns of a (partial) checkpoint: an absent property maps to absent columns. */
function toCheckpointEntity(value: Partial<CheckpointRecord>): DeepPartial<CheckpointEntity> {
    return {
        id: value.id,
        runId: value.runId,
        stepIndex: value.stepIndex,
        messages: value.messages,
        finishReason: value.finishReason,
        conversationScopeId: value.conversation?.scopeId,
        conversationGeneration: value.conversation?.generation,
        createdAt: value.createdAt,
    } as DeepPartial<CheckpointEntity>;
}

/** The checkpoint of a row: a NULL column is an absent property. */
function fromCheckpointEntity(entity: CheckpointEntity): CheckpointRecord {
    const checkpoint: CheckpointRecord = {
        id: entity.id,
        runId: entity.runId,
        stepIndex: entity.stepIndex,
        messages: entity.messages,
        createdAt: entity.createdAt,
    };

    if (entity.finishReason !== null) {
        checkpoint.finishReason = entity.finishReason;
    }

    if (entity.conversationScopeId !== null) {
        checkpoint.conversation = {
            scopeId: entity.conversationScopeId,
            generation: entity.conversationGeneration!,
        };
    }

    return checkpoint;
}

/** Checkpoints in `chamvi_checkpoints` (one row per run), stored as given. */
export class DatabaseCheckpointRepository extends EntityRepositoryAdapter<CheckpointRecord, CheckpointEntity> implements ICheckpointRepository {
    constructor(source: DataSource | EntityManager) {
        super(source.getRepository(CheckpointEntity), {
            entity: 'checkpoint',
            alias: 'checkpoint',
            target: CheckpointEntity,
            toEntity: toCheckpointEntity,
            fromEntity: fromCheckpointEntity,
            fields: {
                'conversation.scopeId': 'conversationScopeId',
                'conversation.generation': 'conversationGeneration',
            },
            related: [
                { target: RunEntity, entity: 'run' },
                { target: ConversationEntity, entity: 'conversation' },
            ],
        });
    }

    withManager(manager: EntityManager): this {
        return new DatabaseCheckpointRepository(manager) as this;
    }
}
