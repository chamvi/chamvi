/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';
import type { KnowledgeDocument } from '../../store/types.ts';
import type { KnowledgeDocumentInput } from '../../source/types.ts';

/** Whether a stored document's chunks still carry the input's title and source. */
export function sameOrigin(stored: KnowledgeDocument, input: KnowledgeDocumentInput): boolean {
    return stored.title === input.title && stored.source === input.source;
}

/** Whether `value` is a plain object (`{}` or without a prototype), not a boxed primitive or a class instance. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (!isObject(value)) {
        return false;
    }

    const prototype: unknown = Object.getPrototypeOf(value);

    return prototype === Object.prototype || prototype === null;
}

/**
 * The JSON of `value` with every plain object's keys sorted (arrays keep
 * their order, `toJSON` applies first, a boxed primitive stays its value).
 */
function canonicalJson(value: unknown): string | undefined {
    return JSON.stringify(value, (_key, item: unknown) => (isPlainObject(item) ?
        Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) :
        item));
}

/**
 * Whether a stored document needs no new record: same title, source and
 * metadata, key order aside (a jsonb column reads its keys back reordered).
 */
export function sameDetails(stored: KnowledgeDocument, input: KnowledgeDocumentInput): boolean {
    return sameOrigin(stored, input) &&
        canonicalJson(stored.metadata) === canonicalJson(input.metadata);
}

export function documentOf(
    collection: string,
    input: KnowledgeDocumentInput,
    hash: string,
    generation: number,
    updatedAt: Date,
): KnowledgeDocument {
    return {
        collection,
        id: input.id,
        content: input.content,
        hash,
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.source === undefined ? {} : { source: input.source }),
        ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
        status: 'ready',
        generation,
        updatedAt,
    };
}
