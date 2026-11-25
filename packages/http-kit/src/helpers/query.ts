/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createURLCodec } from '@rapiq/codec-url';
import {
    Filter,
    Filters,
    Query,
    defineQuery,
    isFilter,
    isFilters,
    isQuery,
} from '@rapiq/core';
import type { ICondition, IQuery, ObjectLiteral } from '@rapiq/core';
import { parseFilterScalar } from '@rapiq/parser-simple';
import type { EntityQueryInput } from './types.ts';

const codec = createURLCodec();

/** The condition with every text value in the scalar it reads as on the wire (`'007'` as `7`). */
function scalarConditionOf(condition: ICondition): ICondition {
    if (isFilters(condition)) {
        return new Filters(condition.operator, condition.value.map(scalarConditionOf));
    }

    if (isFilter(condition)) {
        const scalar = (value: unknown) => (typeof value === 'string' ? parseFilterScalar(value) : value);
        const { value } = condition;

        return new Filter(condition.operator, condition.field, Array.isArray(value) ? value.map(scalar) : scalar(value));
    }

    return condition;
}

/**
 * The query with its text filter values as the scalars they read as. The
 * bracket dialect coerces them on the server anyway (`filter[agent]=007`
 * arrives as `7`), but the expression dialect refuses such a text; a list
 * route maps the scalar back (an agent name).
 */
function scalarQueryOf(query: IQuery): IQuery {
    return new Query({
        fields: query.fields,
        filters: scalarConditionOf(query.filters) as Filters,
        relations: query.relations,
        pagination: query.pagination,
        sorts: query.sorts,
        groups: query.groups,
        aggregates: query.aggregates,
    });
}

/** The query as a URL query string (`?`-prefixed, `''` when there is nothing to send); the server decodes it with the same codec. */
export function buildQueryString<T extends ObjectLiteral>(input?: EntityQueryInput<T>): string {
    if (!input) {
        return '';
    }

    const query = isQuery(input) ? input : defineQuery<T>(input);
    let encoded: string | null;

    // the simple (bracket) dialect first: the expression dialect refuses a text
    // value that reads as another literal (an agent named `null` or `007`); it
    // is needed for two conditions on one field (createdAt bounds), where such a
    // text travels as the scalar the bracket dialect would deliver
    try {
        encoded = codec.encode(query, { codec: 'url-simple' });
    } catch {
        try {
            encoded = codec.encode(query);
        } catch {
            encoded = codec.encode(scalarQueryOf(query));
        }
    }

    return encoded ? `?${encoded}` : '';
}
