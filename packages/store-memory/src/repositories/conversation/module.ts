/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ConversationRecord, IConversationRepository } from '@chamvi/store';
import { MemoryEntityRepository } from '../../entity/module.ts';
import type { MemoryRepositoryOptions } from '../../entity/types.ts';
import type { MemoryTransaction } from '../../registry/types.ts';
import { MemoryConversationItemRepository } from './item.ts';
import { MemoryConversationNoteRepository } from './note.ts';
import { MemoryConversationOperationRepository } from './operation.ts';

/**
 * Conversations in the registry (entity `conversation`, key `id`, `key`
 * unique, `activeRunId` referencing a run), stored as given, with their
 * items, notes and operations as child repositories on the same registry;
 * a transaction binds all four.
 */
export class MemoryConversationRepository extends MemoryEntityRepository<ConversationRecord> implements IConversationRepository {
    items: MemoryConversationItemRepository;

    notes: MemoryConversationNoteRepository;

    operations: MemoryConversationOperationRepository;

    constructor(options: MemoryRepositoryOptions) {
        super({
            entity: 'conversation',
            registry: options.registry,
            key: ['id'],
            unique: [['key']],
            references: [{ field: 'activeRunId', entity: 'run' }],
        });

        this.items = new MemoryConversationItemRepository(options);
        this.notes = new MemoryConversationNoteRepository(options);
        this.operations = new MemoryConversationOperationRepository(options);
    }

    protected override bind(transaction: MemoryTransaction): this {
        const bound = super.bind(transaction);

        bound.items = this.bindChild(this.items, transaction);
        bound.notes = this.bindChild(this.notes, transaction);
        bound.operations = this.bindChild(this.operations, transaction);

        return bound;
    }
}
