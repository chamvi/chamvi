/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/errors';
import { isObject } from 'smob';
import { KNOWLEDGE_DOCUMENT_ID_MAX_LENGTH } from './constants.ts';
import type { KnowledgeDocumentInput } from './types.ts';

/**
 * Whether `value` is a document id: 1 to KNOWLEDGE_DOCUMENT_ID_MAX_LENGTH
 * characters, well-formed (no lone surrogate: PostgreSQL would store U+FFFD
 * and never find the id again) and without NUL.
 */
export function isDocumentId(value: unknown): value is string {
    return typeof value === 'string' &&
        value.length > 0 &&
        value.length <= KNOWLEDGE_DOCUMENT_ID_MAX_LENGTH &&
        value.isWellFormed() &&
        !value.includes('\0');
}

/**
 * The problem of a document a source yielded (`origin` `source`, the default)
 * or a request sent (`request`), or undefined when it is valid. The message
 * names the id (when it is one), never the content.
 */
export function documentProblem(value: unknown, origin: 'source' | 'request' = 'source'): ValidationError | undefined {
    const subject = origin === 'source' ? 'A knowledge source yielded a document' : 'A knowledge document';
    const end = origin === 'source' ? '; skipped.' : '.';

    if (!isObject(value)) {
        return new ValidationError(`${subject} that is no object${end}`);
    }

    const item = value as Partial<KnowledgeDocumentInput>;

    if (!isDocumentId(item.id)) {
        return new ValidationError(
            `${subject} whose id is not 1 to ${KNOWLEDGE_DOCUMENT_ID_MAX_LENGTH} well-formed characters without NUL${end}`,
        );
    }

    const name = `Knowledge document "${item.id}"`;

    if (typeof item.content !== 'string') {
        return new ValidationError(`${name}: content must be a string${end}`);
    }

    for (const key of ['title', 'source'] as const) {
        if (item[key] !== undefined && typeof item[key] !== 'string') {
            return new ValidationError(`${name}: ${key} must be a string${end}`);
        }
    }

    if (item.metadata !== undefined && !isObject(item.metadata)) {
        return new ValidationError(`${name}: metadata must be a plain object${end}`);
    }

    if (item.metadata !== undefined) {
        try {
            // the repository stores a copy: a function or a symbol would fail the whole sync
            structuredClone(item.metadata);
        } catch {
            return new ValidationError(`${name}: metadata must be cloneable${end}`);
        }
    }

    return undefined;
}

/**
 * Text as every backend keeps it: NUL (refused by a PostgreSQL text column)
 * and lone surrogates (not encodable as UTF-8) become U+FFFD. Each replaces
 * one UTF-16 code unit, so chunk offsets hold.
 */
export function storedText(value: string): string {
    return value.replaceAll('\0', '\uFFFD').toWellFormed();
}

/** `value` with every string and plain-object key as stored (`storedText`); other values as given. */
function storedJson(value: unknown): unknown {
    if (typeof value === 'string') {
        return storedText(value);
    }

    if (Array.isArray(value)) {
        return value.map((item) => storedJson(item));
    }

    if (isObject(value)) {
        const prototype: unknown = Object.getPrototypeOf(value);

        if (prototype === Object.prototype || prototype === null) {
            return Object.fromEntries(Object.entries(value).map(([key, item]) => [storedText(key), storedJson(item)]));
        }
    }

    return value;
}

/**
 * A valid document as every backend stores it, so memory and PostgreSQL hold
 * the same text and a document compares equal to its next yield (rejected:
 * comparing through the replacement while memory keeps the raw text, which
 * lost a NUL-to-U+FFFD edit there).
 */
export function storedDocument(document: KnowledgeDocumentInput): KnowledgeDocumentInput {
    return {
        ...document,
        content: storedText(document.content),
        ...(document.title === undefined ? {} : { title: storedText(document.title) }),
        ...(document.source === undefined ? {} : { source: storedText(document.source) }),
        ...(document.metadata === undefined ? {} : { metadata: storedJson(document.metadata) as Record<string, unknown> }),
    };
}
