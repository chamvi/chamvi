/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ConversationNoteRecord, IConversationNoteRepository } from '@chamvi/store';
import { MemoryEntityRepository } from '../entity/module.ts';
import type { MemoryRepositoryOptions } from '../entity/types.ts';

/**
 * Conversation notes in the registry (entity `conversation_note`, key
 * `id`, `(scopeId, generation, key)` unique, `scopeId` referencing a
 * conversation, `source.runId` a run), stored as given.
 */
export class MemoryConversationNoteRepository extends MemoryEntityRepository<ConversationNoteRecord> implements IConversationNoteRepository {
    constructor(options: MemoryRepositoryOptions) {
        super({
            entity: 'conversation_note',
            registry: options.registry,
            key: ['id'],
            unique: [['scopeId', 'generation', 'key']],
            references: [
                { field: 'scopeId', entity: 'conversation' },
                { field: 'source.runId', entity: 'run' },
            ],
        });
    }
}
