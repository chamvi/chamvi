/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource, EntityManager } from 'typeorm';
import type { IConversationItemRepository } from '@chamvi/store';
import type { ConversationItemRecord } from '@chamvi/core-kit';
import { ConversationEntity, ConversationItemEntity, RunEntity } from '../../entities/index.ts';
import { EntityRepositoryAdapter } from '../../entity/module.ts';
import { fromConversationItemEntity, toConversationItemEntity } from './helpers.ts';

/**
 * Conversation items in `chamvi_conversation_items` (the bigint identity
 * `id` is the storage key, assigned in the order rows are inserted;
 * `(scope_id, generation, key)` unique), stored as given; `upsert`
 * replaces by `(scopeId, generation, key)` and keeps the storage key.
 */
export class DatabaseConversationItemRepository
    extends EntityRepositoryAdapter<ConversationItemRecord, ConversationItemEntity>
    implements IConversationItemRepository {
    constructor(source: DataSource | EntityManager) {
        super(source.getRepository(ConversationItemEntity), {
            entity: 'conversation_item',
            alias: 'conversationItem',
            target: ConversationItemEntity,
            toEntity: toConversationItemEntity,
            fromEntity: fromConversationItemEntity,
            fields: {
                'target.channel': 'targetChannel',
                'target.address': 'targetAddress',
            },
            related: [
                { target: ConversationEntity, entity: 'conversation' },
                { target: RunEntity, entity: 'run' },
            ],
            upsertKey: ['scopeId', 'generation', 'key'],
        });
    }

    withManager(manager: EntityManager): this {
        return new DatabaseConversationItemRepository(manager) as this;
    }
}
