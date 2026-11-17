/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource, EntityManager } from 'typeorm';
import type { ConversationOperationRecord, IConversationOperationRepository } from '@chamvi/store';
import { ConversationEntity, ConversationOperationEntity, RunEntity } from '../entities/index.ts';
import { EntityRepositoryAdapter } from '../entity/module.ts';
import { fromConversationOperationEntity, toConversationOperationEntity } from './helpers.ts';

/**
 * Conversation note operations in `chamvi_conversation_operations`
 * (`(scope_id, generation, operation_id)` unique), stored as given.
 */
export class DatabaseConversationOperationRepository
    extends EntityRepositoryAdapter<ConversationOperationRecord, ConversationOperationEntity>
    implements IConversationOperationRepository {
    constructor(source: DataSource | EntityManager) {
        super(source.getRepository(ConversationOperationEntity), {
            entity: 'conversation_operation',
            alias: 'conversationOperation',
            target: ConversationOperationEntity,
            toEntity: toConversationOperationEntity,
            fromEntity: fromConversationOperationEntity,
            related: [
                { target: ConversationEntity, entity: 'conversation' },
                { target: RunEntity, entity: 'run' },
            ],
        });
    }

    withManager(manager: EntityManager): this {
        return new DatabaseConversationOperationRepository(manager) as this;
    }
}
