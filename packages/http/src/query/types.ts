/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    FilterFieldOperator,
    IFilter,
    ISort,
    ObjectLiteral,
    Schema,
} from '@rapiq/core';

/** A filter operator rapiq decodes (`eq`, `in`, `gte`, `startsWith`, ...). */
export type ListFilterOperator = `${FilterFieldOperator}`;

export type ListSortDirection = 'ASC' | 'DESC';

/** A top-level property name of `T`. */
export type ListSchemaKey<T> = Extract<keyof T, string>;

/**
 * What a list schema names its entity by, for the check a database module
 * runs at start: an entity class, an `EntitySchema` or its name.
 */
export type ListSchemaEntity = string | object;

export type ListSchemaOptions<T extends ObjectLiteral = ObjectLiteral> = {
    /** Names the schema in a configuration error; default the entity's name. */
    name?: string;
    /**
     * The entity the list reads. `databaseModule({ schemas })` checks at
     * start that every field, sort, key and relation named here exists on
     * it; a schema used with a memory repository may leave it out.
     */
    entity?: ListSchemaEntity;
    /** The fields a client may select (`fields=`); default none: a list answers every field. */
    fields?: ListSchemaKey<T>[];
    /** The fields a client may filter on (`filter[<field>]=`); default none. */
    filters?: ListSchemaKey<T>[];
    /**
     * The operators each filter field takes; a field not named here takes
     * `eq`, `ne`, `in`, `nin`, `lt`, `lte`, `gt` and `gte`. Matching is
     * case-sensitive on every repository.
     */
    operators?: Partial<Record<ListSchemaKey<T>, ListFilterOperator[]>>;
    /**
     * Compound filters (`or`, `not`, a nested `and`) are taken; default
     * false: the filters are leaves joined with `and`.
     */
    nested?: boolean;
    /** The fields a client may sort by (`sort=`); default none. */
    sorts?: ListSchemaKey<T>[];
    /** The order of a request without `sort=`, before the key; default none (the key alone). */
    sort?: Partial<Record<ListSchemaKey<T>, ListSortDirection>>;
    /**
     * The fields that identify a row, appended to every order in the
     * direction of its last sort so a page boundary is stable; default
     * `['id']`. A field the order already names is not repeated.
     */
    key?: ListSchemaKey<T>[];
    /** The relations a client may include (`include=`); default none. */
    relations?: ListSchemaKey<T>[];
    /** The page size without `page[limit]`; default 50, at most `maxLimit`. */
    defaultLimit?: number;
    /** The largest `page[limit]` taken (a larger one is refused, never cut); default 100. */
    maxLimit?: number;
};

/** A list schema `defineSchema()` built: the options with their defaults, read-only. */
export type ListSchema = Readonly<{
    name: string | undefined;
    entity: ListSchemaEntity | undefined;
    fields: readonly string[];
    filters: readonly string[];
    /** Per filter field, the operators it takes. */
    operators: Readonly<Record<string, readonly ListFilterOperator[]>>;
    nested: boolean;
    sorts: readonly string[];
    sort: Readonly<Record<string, ListSortDirection>>;
    key: readonly string[];
    relations: readonly string[];
    defaultLimit: number;
    maxLimit: number;
    /** The rapiq schema `decodeQuery` decodes with. */
    // rapiq's Schema is invariant in its record type; a list schema of any entity is one type
    schema: Schema<any>;
}>;

/** A rapiq query reduced to what chamvi's own routes support; internal. */
export type DecodedQuery = {
    /** Top-level leaves, joined with `and`. */
    filters: IFilter[];
    limit?: number;
    offset?: number;
    sorts: ISort[];
};

/** How a request's query is decoded: what it may hold besides filters, sorts and a page. */
export type QueryDecodeRules = {
    /** `fields=` is read (else ignored). */
    fields: boolean;
    /** `include=` is read (else ignored). */
    relations: boolean;
    /** Compound filters are taken. */
    nested: boolean;
    /** The largest `page[limit]` taken. */
    maxLimit: number;
    /** An issue keeps the request's value it refers to (`received`), as chamvi's own routes answer. */
    received: boolean;
};
