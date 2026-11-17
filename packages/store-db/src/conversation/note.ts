/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource, EntityManager } from 'typeorm';
import type { ConversationNoteRecord, IConversationNoteRepository } from '@chamvi/store';
import { ConversationEntity, ConversationNoteEntity, RunEntity } from '../entities/index.ts';
import { EntityRepositoryAdapter } from '../entity/module.ts';
import { fromConversationNoteEntity, toConversationNoteEntity } from './helpers.ts';

/**
 * Conversation notes in `chamvi_conversation_notes` (`key` `COLLATE "C"`,
 * `(scope_id, generation, key)` unique), stored as given.
 */
export class DatabaseConversationNoteRepository
    extends EntityRepositoryAdapter<ConversationNoteRecord, ConversationNoteEntity>
    implements IConversationNoteRepository {
    constructor(source: DataSource | EntityManager) {
        super(source.getRepository(ConversationNoteEntity), {
            entity: 'conversation_note',
            alias: 'conversationNote',
            target: ConversationNoteEntity,
            toEntity: toConversationNoteEntity,
            fromEntity: fromConversationNoteEntity,
            fields: {
                'source.runId': 'runId',
                'source.toolCallId': 'toolCallId',
                'source.stepIndex': 'stepIndex',
            },
            related: [
                { target: ConversationEntity, entity: 'conversation' },
                { target: RunEntity, entity: 'run' },
            ],
        });
    }

    withManager(manager: EntityManager): this {
        return new DatabaseConversationNoteRepository(manager) as this;
    }
}
