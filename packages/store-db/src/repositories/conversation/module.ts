/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource, EntityManager } from 'typeorm';
import type { IConversationRepository } from '@chamvi/store';
import type { ConversationRecord } from '@chamvi/core-kit';
import {
    CheckpointEntity,
    ConversationEntity,
    ConversationItemEntity,
    ConversationNoteEntity,
    ConversationOperationEntity,
    RunEntity,
} from '../../entities/index.ts';
import { EntityRepositoryAdapter } from '../../entity/module.ts';
import type { EntityTransaction } from '../../entity/types.ts';
import { fromConversationEntity, toConversationEntity } from './helpers.ts';
import { DatabaseConversationItemRepository } from './item.ts';
import { DatabaseConversationNoteRepository } from './note.ts';
import { DatabaseConversationOperationRepository } from './operation.ts';

/**
 * Conversations in `chamvi_conversations` (`key` unique, `COLLATE "C"`),
 * stored as given, with their items, notes and operations as child
 * repositories on the same data source or manager; a transaction binds
 * all of them to its manager. Inside a transaction a single-row read of a
 * conversation takes `FOR NO KEY UPDATE`: the row's key never changes, so
 * the lock does not hold off the inserts of child rows, runs and
 * checkpoints that reference it.
 */
export class DatabaseConversationRepository
    extends EntityRepositoryAdapter<ConversationRecord, ConversationEntity>
    implements IConversationRepository {
    readonly items: DatabaseConversationItemRepository;

    readonly notes: DatabaseConversationNoteRepository;

    readonly operations: DatabaseConversationOperationRepository;

    constructor(source: DataSource | EntityManager) {
        super(source.getRepository(ConversationEntity), {
            entity: 'conversation',
            alias: 'conversation',
            target: ConversationEntity,
            lock: 'no-key-update',
            toEntity: toConversationEntity,
            fromEntity: fromConversationEntity,
            fields: {
                'identity.agent': 'agent',
                'identity.channel': 'channel',
                'identity.account': 'account',
                'identity.chat': 'chat',
                'identity.audience': 'audience',
            },
            related: [
                { target: RunEntity, entity: 'run' },
                { target: CheckpointEntity, entity: 'checkpoint' },
                { target: ConversationItemEntity, entity: 'conversation_item' },
                { target: ConversationNoteEntity, entity: 'conversation_note' },
                { target: ConversationOperationEntity, entity: 'conversation_operation' },
            ],
        });

        this.items = new DatabaseConversationItemRepository(source);
        this.notes = new DatabaseConversationNoteRepository(source);
        this.operations = new DatabaseConversationOperationRepository(source);
    }

    withManager(manager: EntityManager): this {
        return new DatabaseConversationRepository(manager) as this;
    }

    protected override bindTo(source: EntityRepositoryAdapter<ConversationRecord, ConversationEntity>, transaction: EntityTransaction): void {
        super.bindTo(source, transaction);

        const parent = source as DatabaseConversationRepository;

        this.bindChild(this.items, parent.items);
        this.bindChild(this.notes, parent.notes);
        this.bindChild(this.operations, parent.operations);
    }
}
