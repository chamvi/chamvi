/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    KnowledgeCollection,
    KnowledgeCollectionRecord,
    KnowledgeDocument,
    KnowledgeDocumentDetails,
    KnowledgeDocumentRecord,
    KnowledgeDocumentVersion,
} from '../../store/types.ts';

export const copy = <T>(value: T): T => structuredClone(value);

/** The collection a row holds, without its row id and fence. */
export function toCollection(record: KnowledgeCollectionRecord): KnowledgeCollection {
    const collection: Partial<KnowledgeCollectionRecord> = { ...record };

    delete collection.id;
    delete collection.fence;

    return collection as KnowledgeCollection;
}

/** The document a row holds, under its collection's name. */
export function toDocument(record: KnowledgeDocumentRecord, collection: string): KnowledgeDocument {
    const document: Partial<KnowledgeDocumentRecord> = { ...record };

    delete document.key;
    delete document.collectionId;

    return { ...document as Omit<KnowledgeDocument, 'collection'>, collection };
}

/** The fields of a document a row stores, without its collection's name. */
export function documentFieldsOf(document: KnowledgeDocument): Omit<KnowledgeDocument, 'collection'> {
    const fields: Partial<KnowledgeDocument> = { ...document };

    delete fields.collection;

    return fields as Omit<KnowledgeDocument, 'collection'>;
}

/** Whether the document has that version's hash, title and source (absent matches absent only). */
export function isVersion(document: KnowledgeDocumentVersion, version: KnowledgeDocumentVersion): boolean {
    return document.hash === version.hash &&
        document.title === version.title &&
        document.source === version.source;
}

/** A copy of the row with the given title and source; one not given is removed. */
export function withOrigin<T extends { title?: string; source?: string }>(row: T, details: KnowledgeDocumentDetails): T {
    const next: T = { ...row };

    delete next.title;
    delete next.source;

    if (details.title !== undefined) {
        next.title = details.title;
    }

    if (details.source !== undefined) {
        next.source = details.source;
    }

    return next;
}

/** A copy of the document row with the given title, source and metadata; one not given is removed. */
export function withDetails(row: KnowledgeDocumentRecord, details: KnowledgeDocumentDetails): KnowledgeDocumentRecord {
    const next = withOrigin(row, details);

    delete next.metadata;

    if (details.metadata !== undefined) {
        next.metadata = copy(details.metadata);
    }

    return next;
}
