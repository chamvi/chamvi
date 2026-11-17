/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export type ApplyQueryOptions = {
    /**
     * Public field paths and the entity property each reads, e.g.
     * `{ 'claim.owner': 'claimOwner' }` (a repository's `fields`); a path
     * not listed is the property of the same name.
     */
    fields?: Record<string, string>;
    /** The entity's label in a refusal (`EntityQueryError`); default the entity's metadata name. */
    entity?: string;
};

/** The page `applyQuery` put on the query builder. */
export type ApplyQueryResult = {
    limit?: number;
    offset?: number;
};

/**
 * What `validateEntitySchemas` reads of a list schema: the shape
 * `defineSchema()` of `@chamvi/http` builds (`ListSchema`), structurally.
 */
export type EntityListSchema = {
    /** Names the schema in an error; default the entity's name. */
    name?: string | undefined;
    /** The entity: its class, its `EntitySchema` or its name. */
    entity?: string | object | undefined;
    fields: readonly string[];
    filters: readonly string[];
    sorts: readonly string[];
    sort: Readonly<Record<string, string>>;
    key: readonly string[];
    relations: readonly string[];
};
