/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { flattenIssueItems } from '@ebec/core';
import type { Issue } from '@ebec/core';
import { BadRequestError } from '@ebec/http';
import { createURLCodec } from '@rapiq/codec-url';
import {
    CodecError,
    isFilter,
    isFilters,
    isParseError,
} from '@rapiq/core';
import type {
    ICondition,
    IQuery,
    ISort,
    Schema,
} from '@rapiq/core';
import { MAX_PAGE_LIMIT } from '../app/constants.ts';
import { LIST_RESERVED_KEYS } from './constants.ts';
import type {
    DecodedQuery,
    ListFilterOperator,
    ListSchema,
    QueryDecodeRules,
} from './types.ts';

const codec = createURLCodec();

// rapiq's Schema is invariant in its record type; the codec takes any of them
type AnySchema = Schema<any>;

/** `issues` without the request's own values (`received`), groups walked. */
function withoutReceived(issues: readonly Issue[]): Issue[] {
    return issues.map((issue) => {
        if (issue.type === 'group') {
            return { ...issue, issues: withoutReceived(issue.issues) };
        }

        const item = { ...issue };

        delete item.received;

        return item;
    });
}

function decodeWithCodec(searchParams: URLSearchParams, schema: AnySchema, rules: QueryDecodeRules): IQuery | null {
    try {
        return codec.decode(searchParams.toString(), {
            schema,
            fields: rules.fields,
            relations: rules.relations,
        });
    } catch (error) {
        if (isParseError(error) || error instanceof CodecError) {
            const issues = rules.received ? error.issues : withoutReceived(error.issues);
            const message = issues.length > 0 ? flattenIssueItems(issues).map((issue) => issue.message).join('; ') : error.message;

            throw new BadRequestError({ message, issues });
        }

        throw error;
    }
}

/**
 * Decodes a rapiq URL query (bracket or expression dialect) against
 * `schema` (built with `throwOnFailure: true` and without `maxLimit`): a
 * 400 for a key the schema refuses, a malformed page value, a compound
 * filter (unless `rules.nested`) or a limit above `rules.maxLimit`. No
 * message carries a value of the request; an issue does only with
 * `rules.received`. `null` for an empty query. The one decoder of chamvi's list routes and `decodeQuery`.
 */
export function decodeQueryRequest(searchParams: URLSearchParams, schema: AnySchema, rules: QueryDecodeRules): IQuery | null {
    assertNoReservedKey(searchParams);

    const query = decodeWithCodec(searchParams, schema, rules);

    // rapiq reads page values with parseInt ('1e2' -> 1, '50.5' -> 50); checked
    // after the codec, so its own rejections keep their issues
    for (const key of ['limit', 'offset']) {
        for (const value of searchParams.getAll(`page[${key}]`)) {
            // a value above the largest safe integer would reach the driver rounded (1e20)
            if (!/^\d+$/.test(value.trim()) || Number(value) > Number.MAX_SAFE_INTEGER) {
                throw new BadRequestError({ message: `page[${key}] takes a non-negative integer.` });
            }
        }
    }

    if (!query) {
        return null;
    }

    const root = query.filters;
    const children = isFilters(root) && root.operator === 'and' ? root.value : [root];

    const compound = children.some((child) => !isFilter(child));

    if (!rules.nested && compound) {
        throw new BadRequestError({ message: 'Only top-level filters joined with "and" are supported.' });
    }

    const { limit } = query.pagination;

    if (limit !== undefined && limit > rules.maxLimit) {
        throw new BadRequestError({ message: `The pagination limit must not exceed the value of ${rules.maxLimit}.` });
    }

    return query;
}

/**
 * 400 for a parameter whose name has a reserved segment
 * (`filter[__proto__]`, `page[constructor]`): refused before the codec,
 * which would ignore it. The message names the reserved word only.
 */
function assertNoReservedKey(searchParams: URLSearchParams): void {
    for (const name of searchParams.keys()) {
        const reserved = name.split(/[[\]]+/).find((segment) => LIST_RESERVED_KEYS.includes(segment));

        if (reserved !== undefined) {
            throw new BadRequestError({ message: `The query key "${reserved}" is reserved.` });
        }
    }
}

/**
 * A query of chamvi's own list routes: top-level filter leaves, a page of
 * at most 100, sorts; `fields=` and `include=` are ignored.
 */
export function decodeFlatQuery(searchParams: URLSearchParams, schema: AnySchema): DecodedQuery {
    const query = decodeQueryRequest(searchParams, schema, {
        fields: false,
        relations: false,
        nested: false,
        maxLimit: MAX_PAGE_LIMIT,
        received: true,
    });

    if (!query) {
        return { filters: [], sorts: [] };
    }

    const root = query.filters;
    const children = isFilters(root) && root.operator === 'and' ? root.value : [root];
    const { limit, offset } = query.pagination;

    return {
        filters: children.filter((child) => isFilter(child)),
        ...(limit !== undefined ? { limit } : {}),
        ...(offset !== undefined ? { offset } : {}),
        sorts: query.sorts.value,
    };
}

/** 400 for a filter whose operator its field does not take, nested conditions walked. */
export function assertOperators(condition: ICondition, operators: Readonly<Record<string, readonly ListFilterOperator[]>>): void {
    if (isFilters(condition)) {
        for (const child of condition.value) {
            assertOperators(child, operators);
        }

        return;
    }

    if (isFilter(condition) && !(operators[condition.field] ?? []).includes(condition.operator as ListFilterOperator)) {
        throw new BadRequestError({ message: `filter[${condition.field}] does not take the operator ${condition.operator}.` });
    }
}

/**
 * 400 for an included relation the schema does not name: rapiq takes
 * `include=author.organization` when `author` is allowed, and the
 * TypeORM adapter would join and select every column of each path.
 */
export function assertRelations(names: readonly string[], allowed: readonly string[]): void {
    const refused = names.find((name) => !allowed.includes(name));

    if (refused !== undefined) {
        throw new BadRequestError({ message: `The relation ${refused} may not be included.` });
    }
}

/**
 * The order of a list: the requested sorts, else the schema's default
 * order, then each key field not named yet, in the direction of the last
 * sort (ascending without one).
 */
export function orderOf(sorts: readonly ISort[], schema: ListSchema): Array<{ name: string; operator: 'ASC' | 'DESC' }> {
    const order: Array<{ name: string; operator: 'ASC' | 'DESC' }> = sorts.length > 0 ?
        sorts.map((sort) => ({ name: sort.name, operator: sort.operator })) :
        Object.entries(schema.sort).map(([name, operator]) => ({ name, operator }));
    const direction = order.at(-1)?.operator ?? 'ASC';

    const named = new Set(order.map((sort) => sort.name));

    for (const name of schema.key) {
        if (!named.has(name)) {
            order.push({ name, operator: direction });
        }
    }

    return order;
}
