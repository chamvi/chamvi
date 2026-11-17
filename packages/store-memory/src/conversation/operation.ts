/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ConversationOperationRecord, IConversationOperationRepository } from '@chamvi/store';
import { MemoryEntityRepository } from '../entity/module.ts';
import type { MemoryRepositoryOptions } from '../entity/types.ts';

/**
 * Conversation note operations in the registry (entity
 * `conversation_operation`, key `id`, `(scopeId, generation, operationId)`
 * unique, `scopeId` referencing a conversation, `runId` a run), stored as
 * given.
 */
export class MemoryConversationOperationRepository
    extends MemoryEntityRepository<ConversationOperationRecord>
    implements IConversationOperationRepository {
    constructor(options: MemoryRepositoryOptions) {
        super({
            entity: 'conversation_operation',
            registry: options.registry,
            key: ['id'],
            unique: [['scopeId', 'generation', 'operationId']],
            references: [
                { field: 'scopeId', entity: 'conversation' },
                { field: 'runId', entity: 'run' },
            ],
        });
    }
}
