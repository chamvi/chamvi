/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { BadRequestError } from '@ebec/http';
import {
    and,
    defineQuery,
    defineSchema,
    eq,
} from '@rapiq/core';
import type { IFilter, IQuery } from '@rapiq/core';
import { isObject } from 'smob';
import { Container } from 'validup';
import { DEFAULT_PAGE_LIMIT } from '../../app/constants.ts';
import { decodeFlatQuery } from '../../query/helpers.ts';
import { isDefined } from '../../request/validators.ts';
import type { KvWriteBody, StateDocumentView } from '../types.ts';

/**
 * Any top-level filter key, no sort; values are coerced by rapiq (`2` ->
 * `2`, `true`, `null`), and `collectionFilterValue` makes a double-quoted value a string.
 */
const COLLECTION_QUERY_SCHEMA = defineSchema({ sorts: { allowed: [] }, throwOnFailure: true });

const KV_LIST_QUERY_SCHEMA = defineSchema({
    filters: { allowed: [] },
    sorts: { allowed: [] },
    throwOnFailure: true,
});

export function createKvContainer(): Container<KvWriteBody> {
    const container = new Container<KvWriteBody>();

    container.mount('value', isDefined());

    return container;
}

/**
 * A collection filter value: rapiq coerces `42`, `007`, `true` and `null`
 * (quoted or not), so one pair of double quotes marks a string that keeps
 * its text (`"42"` -> `'42'`); everything else is rapiq's value.
 */
function collectionFilterValue(value: unknown): unknown {
    if (typeof value === 'string' && value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
        return value.slice(1, -1);
    }

    return value;
}

/** A KV list query: `page[limit]` (default 50, at most 100) and `page[offset]`, no filter, no sort. */
export function parseKvListQuery(searchParams: URLSearchParams): IQuery {
    const decoded = decodeFlatQuery(searchParams, KV_LIST_QUERY_SCHEMA);

    if (decoded.filters.length > 0) {
        throw new BadRequestError({ message: 'The kv listing takes no filter.' });
    }

    return defineQuery({ pagination: { limit: decoded.limit ?? DEFAULT_PAGE_LIMIT, offset: decoded.offset ?? 0 } });
}

/**
 * A collection list query: top-level `eq` filters on document keys, each
 * once (not `id`, the store id), a double-quoted value as a string; a
 * limit; no offset, no sort.
 */
export function parseCollectionQuery(searchParams: URLSearchParams): IQuery {
    const decoded = decodeFlatQuery(searchParams, COLLECTION_QUERY_SCHEMA);
    const seen = new Set<string>();
    const filters: IFilter[] = [];

    for (const filter of decoded.filters) {
        if (filter.operator !== 'eq') {
            throw new BadRequestError({ message: 'Only top-level equality filters are supported.' });
        }

        if (filter.field === 'id') {
            // `id` on the wire is the store id, which a document filter cannot match
            throw new BadRequestError({ message: 'filter[id] is not supported: id is the store id, not a document field.' });
        }

        if (seen.has(filter.field)) {
            throw new BadRequestError({ message: `filter[${filter.field}] may be given once.` });
        }

        seen.add(filter.field);
        filters.push(eq(filter.field, collectionFilterValue(filter.value)));
    }

    if (decoded.offset !== undefined && decoded.offset > 0) {
        throw new BadRequestError({ message: 'page[offset] is not supported for state collections.' });
    }

    return defineQuery({
        ...(filters.length > 0 ? { filters: and(...filters) } : {}),
        pagination: { limit: decoded.limit ?? DEFAULT_PAGE_LIMIT },
    });
}

/** A stored document on the wire: its fields plus the store `id` (which wins over a field named `id`). */
export function serializeDoc(entry: { id: string; doc: unknown }): StateDocumentView {
    return isObject(entry.doc) ? { ...entry.doc, id: entry.id } : { id: entry.id, doc: entry.doc };
}
