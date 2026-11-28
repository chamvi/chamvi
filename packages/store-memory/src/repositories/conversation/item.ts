/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { CONVERSATION_ITEM_STORED_ORDER } from '@chamvi/core-kit';
import type { ConversationItemRecord } from '@chamvi/core-kit';
import type { EntityRecord, IConversationItemRepository } from '@chamvi/store';
import type { MemoryRegistry } from '../../registry/module.ts';
import { MemoryEntityRepository } from '../../entity/module.ts';
import type { MemoryRepositoryOptions } from '../../entity/types.ts';

/** The last sequence handed out per registry, like a database sequence. */
const sequences = new WeakMap<MemoryRegistry, number>();

/**
 * Conversation items in the registry (entity `conversation_item`, key
 * `id`, `(scopeId, generation, key)` unique, `scopeId` referencing a
 * conversation, `runId` a run). An item saved from `create()` or
 * inserted by `upsert` gets the next sequence
 * (`CONVERSATION_ITEM_STORED_ORDER`), in the order items are stored, as
 * a database's identity column; `upsert` replaces by `(scopeId,
 * generation, key)` and keeps the stored `id` and sequence.
 */
export class MemoryConversationItemRepository extends MemoryEntityRepository<ConversationItemRecord> implements IConversationItemRepository {
    constructor(options: MemoryRepositoryOptions) {
        super({
            entity: 'conversation_item',
            registry: options.registry,
            key: ['id'],
            unique: [['scopeId', 'generation', 'key']],
            references: [
                { field: 'scopeId', entity: 'conversation' },
                { field: 'runId', entity: 'run' },
            ],
            upsertKey: ['scopeId', 'generation', 'key'],
        });
    }

    override async save(entity: ConversationItemRecord): Promise<ConversationItemRecord> {
        if (this.created.has(entity)) {
            (entity as EntityRecord)[CONVERSATION_ITEM_STORED_ORDER] = this.nextSequence();
        }

        return super.save(entity);
    }

    /** The replaced row's sequence for a stored item, the next one for a new item. */
    protected override async keepReplacedKey(row: EntityRecord, group: string[]): Promise<boolean> {
        const replacing = await super.keepReplacedKey(row, group);
        const stored = replacing ?
            this.registry.read(this.entity, this.registry.keyOf(this.entity, row), this.tx) :
            undefined;

        row[CONVERSATION_ITEM_STORED_ORDER] = stored ? stored[CONVERSATION_ITEM_STORED_ORDER] : this.nextSequence();

        return replacing;
    }

    protected nextSequence(): number {
        const sequence = (sequences.get(this.registry) ?? 0) + 1;

        sequences.set(this.registry, sequence);

        return sequence;
    }
}
