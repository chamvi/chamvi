/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { CONVERSATION_ITEM_STORED_ORDER } from '@chamvi/store';
import type { ConversationItemRecord, EntityRecord, IConversationItemRepository } from '@chamvi/store';
import type { MemoryRegistry } from '../registry/module.ts';
import { MemoryEntityRepository } from '../entity/module.ts';
import type { MemoryRepositoryOptions } from '../entity/types.ts';

/** The last storage key handed out per registry, like a database sequence. */
const sequences = new WeakMap<MemoryRegistry, number>();

/**
 * Conversation items in the registry (entity `conversation_item`, key
 * `id`, `(scopeId, generation, key)` unique, `scopeId` referencing a
 * conversation, `runId` a run). An item saved from `create()` without an
 * `id` gets the next storage key (`CONVERSATION_ITEM_STORED_ORDER`), in
 * the order items are saved, as a database's identity column; `upsert`
 * replaces by `(scopeId, generation, key)` and keeps the storage key.
 */
export class MemoryConversationItemRepository extends MemoryEntityRepository<ConversationItemRecord> implements IConversationItemRepository {
    constructor(options: MemoryRepositoryOptions) {
        super({
            entity: 'conversation_item',
            registry: options.registry,
            key: [CONVERSATION_ITEM_STORED_ORDER],
            unique: [['scopeId', 'generation', 'key']],
            references: [
                { field: 'scopeId', entity: 'conversation' },
                { field: 'runId', entity: 'run' },
            ],
            upsertKey: ['scopeId', 'generation', 'key'],
        });
    }

    override async save(entity: ConversationItemRecord): Promise<ConversationItemRecord> {
        const row = entity as EntityRecord;

        if (this.created.has(entity) && row[CONVERSATION_ITEM_STORED_ORDER] === undefined) {
            const key = (sequences.get(this.registry) ?? 0) + 1;

            sequences.set(this.registry, key);
            row[CONVERSATION_ITEM_STORED_ORDER] = key;
        }

        return super.save(entity);
    }
}
