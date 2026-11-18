/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';
import type {
    IKnowledgeCollectionRepository,
    KnowledgeCollection,
    KnowledgeCollectionRecord,
    KnowledgeDocument,
    KnowledgeDocumentDetails,
    KnowledgeDocumentRecord,
    KnowledgeDocumentVersion,
} from '../store/types.ts';

export const copy = <T>(value: T): T => structuredClone(value);

/**
 * Orders strings by Unicode code point, like Postgres `COLLATE "C"` on
 * UTF-8 (`<` compares UTF-16 code units, which puts an astral character
 * such as U+1F600 before U+FFFD).
 */
export function compareCodePoints(a: string, b: string): number {
    const left = a[Symbol.iterator]();
    const right = b[Symbol.iterator]();

    for (;;) {
        const l = left.next();
        const r = right.next();

        if (l.done || r.done) {
            if (l.done && r.done) {
                return 0;
            }

            return l.done ? -1 : 1;
        }

        const diff = l.value.codePointAt(0)! - r.value.codePointAt(0)!;

        if (diff !== 0) {
            return diff;
        }
    }
}

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

const REPOSITORY_METHODS = ['findOneBy', 'findMany', 'findManyBy', 'create', 'save', 'upsert', 'upsertMany', 'remove', 'removeManyBy', 'transaction'] as const;

function hasMethods(value: unknown, methods: readonly string[]): boolean {
    return isObject(value) && methods.every((method) => typeof value[method] === 'function');
}

/** Whether `value` looks like an `IKnowledgeCollectionRepository` with its documents and chunks. */
export function isKnowledgeRepository(value: unknown): value is IKnowledgeCollectionRepository {
    return hasMethods(value, REPOSITORY_METHODS) &&
        hasMethods((value as Record<string, unknown>).documents, REPOSITORY_METHODS) &&
        hasMethods((value as Record<string, unknown>).chunks, [...REPOSITORY_METHODS, 'search']);
}
