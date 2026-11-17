/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IQuery } from '@rapiq/core';

/**
 * A stored row: a plain object keyed by property name.
 */
export type EntityRecord = Record<string, any>;

/**
 * A where of `findOneBy`, `findManyBy` and `removeManyBy`: each given
 * property matches its value, `null` (a missing value) or, given an
 * array, any of the array's values (a `null` in it matching a missing
 * value); every given property must match. A
 * property present with the value `undefined` is refused with
 * `EntityQueryError` (omit it instead): a filter never silently widens.
 */
export type EntityWhere<T> = {
    [K in keyof T]?: T[K] | T[K][] | null;
};

/**
 * One page of `findMany`: the rows and the total of the whole selection.
 */
export type EntityFindManyResult<T> = {
    data: T[];
    meta: {
        total: number;
        limit?: number;
        offset?: number;
    };
};

/**
 * The generic repository port of one entity. A repository decides
 * nothing: it stores, reads, locks a row, runs a query and reports
 * `EntityNotFoundError`, `EntityConflictError`, `EntityRelationError`,
 * `EntityDeadlockError` or `EntityQueryError`; status compares, limits, defaults and time stamps
 * belong to the service using it.
 */
export interface IEntityRepository<T extends EntityRecord = EntityRecord> {
    /**
     * Run a rapiq query (fields, filters, sort, pagination) over the
     * entity. Inside `transaction()` it locks none of the rows it returns:
     * a service that changes a listed row reads it again with a single-row
     * read first. A row read with a field selection holds those fields
     * only: `save` of it writes what changed, `upsert` and `upsertMany`
     * refuse it (`EntityQueryError`), by object identity as `save` decides.
     */
    findMany(query: IQuery): Promise<EntityFindManyResult<T>>;

    /**
     * The row with this primary key, or `null`. Inside `transaction()` the
     * row read through the handed-in repository is locked until the
     * transaction ends. An `undefined` or `null` id is refused with
     * `EntityQueryError`.
     */
    findOneById(id: string): Promise<T | null>;

    /**
     * The one row matching the where, or `null`. Inside `transaction()`
     * the row read through the handed-in repository is locked until the
     * transaction ends.
     */
    findOneBy(where: EntityWhere<T>): Promise<T | null>;

    /**
     * Every row matching the where (`EntityWhere`), however many values
     * an array holds. Inside `transaction()` it locks none of the rows it
     * returns: a service that changes a listed row reads it again with a
     * single-row read first.
     */
    findManyBy(where: EntityWhere<T>): Promise<T[]>;

    /**
     * A new entity object; nothing is stored. `save()` inserts it.
     */
    create(data: Partial<T>): T;

    /**
     * Copy `data` onto `entity` and return it; nothing is stored.
     */
    merge(entity: T, data: Partial<T>): T;

    /**
     * Insert or update, decided by object identity: an entity object
     * returned by `create()` is inserted (`EntityConflictError` if its key
     * exists), an entity object returned by a read is updated (its changed
     * properties only). A spread copy of a created entity is neither and
     * counts as an update. Resolves the stored row as a read returns it
     * (a new object, itself marked as read).
     */
    save(entity: T): Promise<T>;

    /**
     * Insert, or replace the row with the same key; no condition. Resolves
     * the stored row as a read returns it. A row `findMany` read with a
     * field selection is refused (`EntityQueryError`): it would clear the
     * fields it lacks.
     */
    upsert(entity: T): Promise<T>;

    /**
     * `upsert` of each entity, in one transaction (all or nothing), in as
     * few statements as the driver allows, however many there are: no
     * condition, a later entity of the same key replaces an earlier one.
     * An empty array stores nothing. Resolves the stored rows as reads
     * return them, in input order.
     */
    upsertMany(entities: T[]): Promise<T[]>;

    /**
     * Delete the entity's row.
     */
    remove(entity: T): Promise<void>;

    /**
     * Delete the rows of every given entity.
     */
    removeMany(entities: T[]): Promise<void>;

    /**
     * Delete every row matching the where (`EntityWhere`) without
     * reading them out, and resolve how many it deleted. An empty where is
     * refused with `EntityQueryError`: there is no remove-all form. A row another entity references is refused as by
     * `remove`, unless the reference removes or clears the referencing
     * rows with it (the driver's schema decides).
     */
    removeManyBy(where: EntityWhere<T>): Promise<number>;

    /**
     * Check that every row `data` references exists, else
     * `EntityRelationError` naming the referenced entity.
     */
    validateRelations(data: Partial<T>): Promise<void>;

    /**
     * Check that no other row holds a unique value of `data`, else
     * `EntityConflictError`; `existing` is the row being updated, which
     * may hold its own values.
     */
    checkUniqueness(data: Partial<T>, existing?: T): Promise<void>;

    /**
     * Run `fn` in one transaction with a repository bound to it. Use only
     * the handed-in repository inside `fn`: a call on the outer repository
     * is not part of the transaction, and a write through it on a row the
     * transaction holds waits for `fn` while `fn` waits for it, so neither
     * ends. A single-row read on the handed-in repository
     * (`findOneById`, `findOneBy`) locks that row until the transaction
     * ends, a list read (`findMany`, `findManyBy`) locks nothing, so a
     * service that changes a row reads it with a single-row read first. A
     * throw rolls everything back, also the identity of entity objects
     * saved in it: a retry saves them as the first attempt did. Await every
     * call on the handed-in repository before `fn` settles: a call that
     * runs after the transaction ended is refused with a storage error.
     */
    transaction<R>(fn: (repository: this) => Promise<R>): Promise<R>;
}
