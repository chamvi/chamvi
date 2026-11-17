/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { MemoryRegistry } from '../registry/module.ts';

export type MemoryEntityReference<T> = {
    /**
     * The field holding the referenced row's key, or a path of a nested
     * object's field joined by dots (`conversation.scope.id`).
     */
    field: Extract<keyof T, string> | `${string}.${string}`;
    /** The label of the referenced entity. */
    entity: string;
};

export type MemoryEntityOptions<T> = {
    /** The entity's label: the registry's table name and the label in errors. */
    entity: string;
    /** The rows, locks and references shared with the other repositories. */
    registry: MemoryRegistry;
    /** The primary key fields. */
    key: (keyof T)[];
    /** Field groups no two rows may share (a `null` value never conflicts). */
    unique?: (keyof T)[][];
    /** Fields that hold a key of another entity: a missing row is `EntityRelationError`. */
    references?: MemoryEntityReference<T>[];
    /**
     * A unique field group (one of `unique`) `upsert` replaces by instead
     * of the key: the row holding the same values of these fields is
     * replaced and keeps its stored key (a surrogate the caller cannot know).
     */
    upsertKey?: (keyof T)[];
    /**
     * Fields holding an instant (a `Date`, or an ISO string as a database
     * column with `dateToISOStringTransformer` reads): a `findMany` filter
     * value on one is compared as the instant it names, whatever offset it
     * is written in, as a database compares a date column; a value that
     * names no instant is refused with `EntityQueryError`.
     */
    dates?: (keyof T)[];
};

/** The options of a repository of one aggregate: the registry it stores in. */
export type MemoryRepositoryOptions = {
    /** The rows, locks and references shared with the other repositories. */
    registry: MemoryRegistry;
};
