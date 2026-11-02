/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    KnowledgeCollectionKind,
    KnowledgeCollectionStatus,
    KnowledgeDocumentStatus,
} from '../repository/types.ts';

/** A collection as the REST routes answer it (dates as ISO strings). */
export type KnowledgeCollectionView = {
    name: string;
    kind: KnowledgeCollectionKind;
    trusted: boolean;
    /** `stale`: a managed collection served at another model or chunker than the default. */
    status: KnowledgeCollectionStatus;
    /** Model identity of the served generation. */
    model: string;
    /** The served generation; 0 = never indexed. */
    generation: number;
    error?: string;
    /** The end of the last successful pass. */
    syncedAt?: string;
    updatedAt: string;
};

/** A document as the REST routes answer it; `content` only on the single-document read. */
export type KnowledgeDocumentView = {
    id: string;
    title?: string;
    source?: string;
    metadata?: Record<string, unknown>;
    status: KnowledgeDocumentStatus;
    /** Why it `failed`. */
    error?: string;
    /** `contentHash(content)`. */
    hash: string;
    content?: string;
    updatedAt: string;
};

/** A page of `GET /knowledge/collections/:name/documents`. */
export type KnowledgeDocumentListView = {
    data: KnowledgeDocumentView[];
    meta: {
        /** Documents matching the filter, before paging. */
        total: number;
        limit: number;
        offset: number;
    };
};
