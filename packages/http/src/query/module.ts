/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { appendQueryConditions } from '@authup/access';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { BadRequestError } from '@ebec/http';
import {
    Fields,
    Filters,
    Pagination,
    Query,
    Relations,
    Sort,
    Sorts,
    defineSchema as defineRapiqSchema,
} from '@rapiq/core';
import type { ICondition, IQuery, ObjectLiteral } from '@rapiq/core';
import {
    LIST_DEFAULT_KEY,
    LIST_DEFAULT_LIMIT,
    LIST_DEFAULT_OPERATORS,
    LIST_MAX_LIMIT,
    LIST_OPERATORS,
} from './constants.ts';
import {
    assertOperators,
    assertRelations,
    decodeQueryRequest,
    orderOf,
} from './helpers.ts';
import type {
    ListFilterOperator,
    ListSchema,
    ListSchemaOptions,
    ListSortDirection,
} from './types.ts';

function assertLimit(name: string, value: number): void {
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new InvalidAgentDefinitionError(`A list schema's ${name} must be a positive integer.`);
    }
}

/** A field of a related entity is not supported yet: the decoder refuses every relation path, so the schema may not name one. */
function assertTopLevel(...lists: string[][]): void {
    const dotted = lists.flat().find((name) => name.includes('.'));

    if (dotted !== undefined) {
        throw new InvalidAgentDefinitionError(`A list schema names "${dotted}": a field of a related entity cannot be filtered, sorted or selected.`);
    }
}

/** rapiq includes every parent of a nested relation: the schema names each one. */
function assertRelationParents(relations: string[]): void {
    for (const relation of relations) {
        const parent = relation.slice(0, Math.max(0, relation.lastIndexOf('.')));

        if (parent.length > 0 && !relations.includes(parent)) {
            throw new InvalidAgentDefinitionError(`A list schema names the relation "${relation}" without its parent "${parent}".`);
        }
    }
}

function entityName(entity: ListSchemaOptions['entity']): string | undefined {
    if (typeof entity === 'string') {
        return entity;
    }

    if (typeof entity === 'function') {
        return entity.name;
    }

    const { options } = (entity ?? {}) as { options?: { name?: unknown } };

    return typeof options?.name === 'string' ? options.name : undefined;
}

/**
 * A list schema: what a client may ask of a list endpoint. Only the
 * filters, operators, sorts, relations and field selections it names are
 * taken; every other key is refused (400) by `decodeQuery`. Nothing is
 * allowed by default. Invalid options throw `InvalidAgentDefinitionError`.
 */
export function defineSchema<T extends ObjectLiteral = ObjectLiteral>(options: ListSchemaOptions<T> = {}): ListSchema {
    const filters: string[] = [...options.filters ?? []];
    const operators: Record<string, readonly ListFilterOperator[]> = {};
    const given = (options.operators ?? {}) as Record<string, ListFilterOperator[] | undefined>;
    const maxLimit = options.maxLimit ?? LIST_MAX_LIMIT;
    const defaultLimit = options.defaultLimit ?? Math.min(LIST_DEFAULT_LIMIT, maxLimit);
    const key: string[] = [...options.key ?? LIST_DEFAULT_KEY];

    assertLimit('maxLimit', maxLimit);
    assertLimit('defaultLimit', defaultLimit);

    if (defaultLimit > maxLimit) {
        throw new InvalidAgentDefinitionError('A list schema\'s defaultLimit must not exceed its maxLimit.');
    }

    if (key.length === 0) {
        throw new InvalidAgentDefinitionError('A list schema\'s key must name at least one field.');
    }

    for (const [field, list] of Object.entries(given)) {
        if (!filters.includes(field)) {
            throw new InvalidAgentDefinitionError(`A list schema names operators for "${field}", which is not among its filters.`);
        }

        const unknown = (list ?? []).filter((operator) => !LIST_OPERATORS.includes(operator));

        if (unknown.length > 0) {
            throw new InvalidAgentDefinitionError(`A list schema names unknown operators for "${field}": ${unknown.join(', ')}.`);
        }
    }

    for (const field of filters) {
        operators[field] = Object.freeze([...given[field] ?? LIST_DEFAULT_OPERATORS]);
    }

    const fields: string[] = [...options.fields ?? []];
    const sorts: string[] = [...options.sorts ?? []];
    const relations: string[] = [...options.relations ?? []];

    assertTopLevel(fields, filters, sorts, key, Object.keys(options.sort ?? {}));
    assertRelationParents(relations);

    const name = options.name ?? entityName(options.entity);

    return Object.freeze({
        name,
        entity: options.entity,
        fields: Object.freeze(fields),
        filters: Object.freeze(filters),
        operators: Object.freeze(operators),
        nested: options.nested ?? false,
        sorts: Object.freeze(sorts),
        sort: Object.freeze({ ...options.sort } as Record<string, ListSortDirection>),
        key: Object.freeze(key),
        relations: Object.freeze(relations),
        defaultLimit,
        maxLimit,
        // empty allow-lists are explicit: rapiq takes an undeclared one as "anything"
        schema: defineRapiqSchema<T>({
            fields: { allowed: fields as never },
            filters: { allowed: filters as never },
            sorts: { allowed: sorts as never },
            relations: { allowed: relations as never },
            throwOnFailure: true,
        }),
    });
}

/**
 * A list request's query string as a rapiq query for `findMany` of any
 * repository, decoded and checked against `schema`: a 400
 * (`BadRequestError`, rendered by chamvi's error handler as
 * `{ status: 400, code: 'bad_request', message, issues? }`) for a filter,
 * operator, sort, relation or field the schema does not allow, a compound
 * filter it does not allow, a nested include it does not name, a field
 * selection with an include, a malformed or unsafe page value, a limit
 * above its `maxLimit` or a reserved key (`filter[__proto__]`,
 * `filter[constructor]`). A message names the key, never a value of the request. The
 * result has a page (`defaultLimit` without `page[limit]`, offset 0 without
 * `page[offset]`) and an order that ends with the schema's key.
 */
export function decodeQuery(searchParams: URLSearchParams, schema: ListSchema): IQuery {
    const names = searchParams.keys().toArray();
    const requested = names.some((name) => name === 'fields' || name.startsWith('fields['));

    const includes = names.some((name) => name === 'include' || name.startsWith('include['));

    if (requested && includes) {
        throw new BadRequestError({ message: 'fields cannot be combined with include: select fields or include relations.' });
    }

    const query = decodeQueryRequest(searchParams, schema.schema, {
        fields: requested,
        relations: true,
        nested: schema.nested,
        maxLimit: schema.maxLimit,
        received: false,
    });

    if (query) {
        assertOperators(query.filters, schema.operators);
        assertRelations(query.relations.value.map((relation) => relation.name), schema.relations);
    }

    const order = orderOf(query?.sorts.value ?? [], schema);

    return new Query({
        fields: query?.fields ?? new Fields(),
        filters: query?.filters ?? new Filters('and', []),
        relations: query?.relations ?? new Relations(),
        sorts: new Sorts(order.map((sort) => new Sort(sort.name, sort.operator))),
        pagination: new Pagination(query?.pagination.limit ?? schema.defaultLimit, query?.pagination.offset ?? 0),
    });
}

/**
 * `query` with `conditions` joined to its filters by `and` at the root,
 * whatever their shape: a decoded query of a schema with `nested` may
 * have an `or` at its root, which a condition pushed into its list would
 * join instead of narrowing. The way a service adds its scope (an owner,
 * a tenant, the agents a caller may read) to a client's query; every
 * other part of the query stays (authup's `appendQueryConditions`).
 */
export function scopeQuery(query: IQuery, ...conditions: ICondition[]): IQuery {
    return appendQueryConditions(query, ...conditions);
}
