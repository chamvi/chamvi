/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/core';
import type { HttpRouteRequest } from '@chamvi/http';
import { isObject } from 'smob';
import type {
    KnowledgeCollection,
    KnowledgeDocument,
    KnowledgeDocumentFindOptions,
    KnowledgeDocumentStatus,
} from '../repository/types.ts';
import { KNOWLEDGE_DOCUMENT_ID_MAX_LENGTH } from '../source/constants.ts';
import { isDocumentId } from '../source/helpers.ts';
import { KNOWLEDGE_DOCUMENTS_DEFAULT_LIMIT, KNOWLEDGE_DOCUMENTS_MAX_LIMIT } from './constants.ts';
import type { KnowledgeCollectionView, KnowledgeDocumentView } from './types.ts';

const DOCUMENT_STATUSES: readonly KnowledgeDocumentStatus[] = ['pending', 'ready', 'failed'];

/**
 * The segments of a route subpath (`''` -> `[]`, `/a/b%2Fc` -> `['a', 'b/c']`),
 * split on the raw `/` and each percent-decoded once, so an encoded `/` stays
 * inside its segment. ValidationError for a segment that does not decode.
 */
export function parseSubpath(subpath: string): string[] {
    if (subpath === '') {
        return [];
    }

    return subpath.slice(1).split('/').map((segment) => {
        try {
            return decodeURIComponent(segment);
        } catch {
            throw new ValidationError('A path segment is not valid percent-encoded UTF-8.');
        }
    });
}

/** The document id of a path segment, else ValidationError. */
export function documentIdOf(segment: string): string {
    if (!isDocumentId(segment)) {
        throw new ValidationError(`A knowledge document id must be 1 to ${KNOWLEDGE_DOCUMENT_ID_MAX_LENGTH} characters without NUL.`);
    }

    return segment;
}

/** The request body as a JSON object, else ValidationError (empty, no JSON, or no object). */
export async function readJsonObject(request: HttpRouteRequest): Promise<Record<string, unknown>> {
    const bytes = await request.readBody();
    let value: unknown;

    try {
        value = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
        throw new ValidationError('The request body must be a JSON object.');
    }

    if (!isObject(value)) {
        throw new ValidationError('The request body must be a JSON object.');
    }

    return value as Record<string, unknown>;
}

function readInteger(params: URLSearchParams, key: string, min: number, max: number, fallback: number): number {
    const raw = params.get(key);

    if (raw === null) {
        return fallback;
    }

    const value = /^\d+$/.test(raw) ? Number(raw) : NaN;

    if (!Number.isSafeInteger(value) || value < min || value > max) {
        throw new ValidationError(`${key} must be an integer from ${min} to ${max}.`);
    }

    return value;
}

/** `page[limit]`, `page[offset]` and `filter[status]` of a document listing, else ValidationError. */
export function readDocumentQuery(url: URL): KnowledgeDocumentFindOptions & { limit: number; offset: number } {
    const params = url.searchParams;
    const limit = readInteger(params, 'page[limit]', 1, KNOWLEDGE_DOCUMENTS_MAX_LIMIT, KNOWLEDGE_DOCUMENTS_DEFAULT_LIMIT);
    const offset = readInteger(params, 'page[offset]', 0, Number.MAX_SAFE_INTEGER, 0);
    const status = params.get('filter[status]');

    if (status !== null && !DOCUMENT_STATUSES.includes(status as KnowledgeDocumentStatus)) {
        throw new ValidationError(`filter[status] must be one of ${DOCUMENT_STATUSES.join(', ')}.`);
    }

    return {
        limit,
        offset,
        ...(status === null ? {} : { status: status as KnowledgeDocumentStatus }),
    };
}

/** The wire view of a collection record (already passed through `IKnowledge.view()`). */
export function toCollectionView(record: KnowledgeCollection): KnowledgeCollectionView {
    return {
        name: record.name,
        kind: record.kind,
        trusted: record.trusted,
        status: record.status,
        model: record.model,
        generation: record.generation,
        ...(record.error === undefined ? {} : { error: record.error }),
        ...(record.syncedAt === undefined ? {} : { syncedAt: record.syncedAt.toISOString() }),
        updatedAt: record.updatedAt.toISOString(),
    };
}

/** The wire view of a document, with its `content` when asked for. */
export function toDocumentView(document: KnowledgeDocument, content = false): KnowledgeDocumentView {
    return {
        id: document.id,
        ...(document.title === undefined ? {} : { title: document.title }),
        ...(document.source === undefined ? {} : { source: document.source }),
        ...(document.metadata === undefined ? {} : { metadata: document.metadata }),
        status: document.status,
        ...(document.error === undefined ? {} : { error: document.error }),
        hash: document.hash,
        ...(content ? { content: document.content } : {}),
        updatedAt: document.updatedAt.toISOString(),
    };
}
