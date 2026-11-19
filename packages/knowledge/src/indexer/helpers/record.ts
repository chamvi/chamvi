/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { CHUNKER_VERSION } from '../../chunk/constants.ts';
import type { ResolvedKnowledgeCollection } from '../../collection/types.ts';
import type { KnowledgeCollection } from '../../store/types.ts';

/** Whether the record serves the definition's model and chunker (nothing to re-embed). */
export function servesDefinition(record: KnowledgeCollection, definition: ResolvedKnowledgeCollection): boolean {
    return record.generation > 0 &&
        record.model === definition.model &&
        record.chunker === CHUNKER_VERSION;
}

/** The record without a pending re-embed. */
export function withoutPending(record: KnowledgeCollection): KnowledgeCollection {
    const rest = { ...record };

    delete rest.pending;

    return rest;
}

/** The record without a pending re-embed, a stored error or a backoff. */
export function settled(record: KnowledgeCollection): KnowledgeCollection {
    const rest = withoutPending(record);

    delete rest.error;
    delete rest.failures;
    delete rest.retryAt;

    return rest;
}

/** The highest generation number the record ever gave out. */
export function highestGeneration(record: KnowledgeCollection): number {
    return Math.max(record.generation, record.pending?.generation ?? 0, record.lastGeneration ?? 0);
}
