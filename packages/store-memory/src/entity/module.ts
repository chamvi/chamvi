/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { applyQuery } from '@rapiq/adapter-memory';
import { Query, Sorts } from '@rapiq/core';
import type { IFilters, IQuery } from '@rapiq/core';
import { isEqual } from 'smob';
import {
    EntityConflictError,
    EntityNotFoundError,
    EntityQueryError,
    EntityRelationError,
} from '@chamvi/store';
import type {
    EntityFindManyResult,
    EntityRecord,
    EntityWhere,
    IEntityRepository,
} from '@chamvi/store';
import type { MemoryRegistry } from '../registry/module.ts';
import type { MemoryTransaction } from '../registry/types.ts';
import {
    applyChanges,
    assertWhere,
    matches,
    sortRows,
    toInstantConditions,
} from './helpers.ts';
import type { MemoryEntityOptions } from './types.ts';

/**
 * The base of every memory repository: stores copies of the rows in the
 * shared `MemoryRegistry`, runs rapiq queries through
 * `@rapiq/adapter-memory` (case sensitive; strings sort by code point, as
 * a database's `COLLATE "C"`) and decides nothing.
 *
 * Outside `transaction()` a read sees the committed rows and a write runs
 * as a transaction of its own. Inside, a single-row read (`findOneById`,
 * `findOneBy`) and every write lock the row until the transaction ends; a
 * storage error of a write (`EntityConflictError`, `EntityRelationError`,
 * `EntityDeadlockError`) aborts the transaction, as a database does: it
 * rolls back and rethrows that error even when `fn` caught it.
 */
export class MemoryEntityRepository<T extends EntityRecord> implements IEntityRepository<T> {
    protected entity: string;

    protected registry: MemoryRegistry;

    protected keyField: string;

    protected keyFields: string[];

    protected uniqueGroups: string[][];

    /** The unique group `upsert` replaces by, if not the key. */
    protected upsertKey: string[] | undefined;

    protected tx: MemoryTransaction | undefined;

    /** Entity objects from `create()` not saved yet: `save` inserts them. */
    protected created: WeakSet<object>;

    /** The values an entity object had when it was read or last saved. */
    protected snapshots: WeakMap<object, EntityRecord>;

    /** Entity objects read with a field selection: `upsert` and `upsertMany` refuse them. */
    protected partial: WeakSet<object>;

    /** The fields a filter compares as an instant. */
    protected dates: string[];

    constructor(options: MemoryEntityOptions<T>) {
        const key = options.key.map(String);

        this.entity = options.entity;
        this.registry = options.registry;
        this.keyField = key[0]!;
        this.keyFields = key;
        this.uniqueGroups = [key, ...(options.unique ?? []).map((fields) => fields.map(String))];
        this.upsertKey = options.upsertKey?.map(String);
        this.dates = (options.dates ?? []).map(String);
        this.created = new WeakSet();
        this.snapshots = new WeakMap();
        this.partial = new WeakSet();

        this.registry.define({
            entity: options.entity,
            key,
            unique: (options.unique ?? []).map((fields) => fields.map(String)),
            references: (options.references ?? []).map((reference) => ({
                field: String(reference.field),
                entity: reference.entity,
            })),
        });
    }

    async findMany(query: IQuery): Promise<EntityFindManyResult<T>> {
        return this.findManyWhere(query);
    }

    /**
     * `findMany` over the rows `filter` keeps (every row without one): a
     * subclass's finder for a condition rapiq cannot express on every
     * driver.
     */
    protected async findManyWhere(query: IQuery, filter?: (row: EntityRecord) => boolean): Promise<EntityFindManyResult<T>> {
        this.assertOpen();

        const rows = this.registry.rows(this.entity, this.tx);
        const kept = filter ? rows.filter(filter) : rows;
        // sorted here by code point (rapiq's memory adapter compares UTF-16 units), filtered and paged by rapiq
        const sorted = query.sorts.value.length > 0 ? sortRows(kept, query.sorts.value) : kept;
        const output = applyQuery(new Query({
            fields: query.fields,
            filters: this.dates.length > 0 ? toInstantConditions(query.filters, this.dates, this.entity) as IFilters : query.filters,
            relations: query.relations,
            pagination: query.pagination,
            sorts: new Sorts(),
        }), sorted, { caseSensitive: true });

        const data = output.data.map((row) => this.toEntity(row));

        // a row of some fields only: an upsert of it would clear the others
        if (query.fields.value.length > 0) {
            for (const entity of data) {
                this.partial.add(entity);
            }
        }

        return {
            data,
            meta: {
                total: output.total,
                ...output.pagination,
            },
        };
    }

    async findOneById(id: string): Promise<T | null> {
        // no key matches no row: never the first row of a where without a condition
        if (id === undefined || id === null) {
            throw new EntityQueryError(this.entity);
        }

        return this.findOneWhere({ [this.keyField]: id });
    }

    async findOneBy(where: EntityWhere<T>): Promise<T | null> {
        assertWhere(this.entity, where);

        return this.findOneWhere(where);
    }

    /** The single-row read of `findOneBy`, after the where's check (a key read needs none). */
    protected async findOneWhere(where: EntityRecord): Promise<T | null> {
        this.assertOpen();

        for (;;) {
            const found = this.candidates(where).find((row) => matches(row, where));

            if (!found) {
                return null;
            }

            if (!this.tx) {
                return this.toEntity(found);
            }

            const key = this.registry.keyOf(this.entity, found);

            await this.registry.lockRow(this.entity, key, this.tx);
            this.assertOpen();

            // read again after the wait: the row may have changed or gone meanwhile
            const current = this.registry.read(this.entity, key, this.tx);

            if (current && matches(current, where)) {
                return this.toEntity(current);
            }
        }
    }

    async findManyBy(where: EntityWhere<T>): Promise<T[]> {
        assertWhere(this.entity, where);
        this.assertOpen();

        return this.registry.rows(this.entity, this.tx)
            .filter((row) => matches(row, where))
            .map((row) => this.toEntity(row));
    }

    create(data: Partial<T>): T {
        const entity = structuredClone(data) as T;

        this.created.add(entity);

        return entity;
    }

    merge(entity: T, data: Partial<T>): T {
        return Object.assign(entity, structuredClone(data));
    }

    async save(entity: T): Promise<T> {
        if (!this.tx) {
            return this.transaction((repository) => repository.save(entity));
        }

        this.assertOpen();

        const key = this.registry.keyOf(this.entity, entity);

        await this.registry.lockRow(this.entity, key, this.tx);
        this.assertOpen();

        const stored = this.registry.read(this.entity, key, this.tx);
        const created = this.created.has(entity);

        if (created && stored) {
            this.abort(new EntityConflictError(this.entity));
        }

        if (!created && !stored) {
            throw new EntityNotFoundError(this.entity);
        }

        const snapshot = this.snapshots.get(entity);
        const next = stored && snapshot ?
            applyChanges(stored, snapshot, entity) :
            structuredClone(entity) as EntityRecord;

        await this.write(entity, key, next, stored);

        return this.toEntity(next);
    }

    async upsert(entity: T): Promise<T> {
        this.assertWhole([entity]);

        if (!this.tx) {
            return this.transaction((repository) => repository.upsert(entity));
        }

        this.assertOpen();

        const row = structuredClone(entity) as EntityRecord;
        const replacing = this.upsertKey ? await this.keepReplacedKey(row, this.upsertKey) : true;
        const key = this.registry.keyOf(this.entity, row);

        await this.registry.lockRow(this.entity, key, this.tx);
        this.assertOpen();

        const stored = this.registry.read(this.entity, key, this.tx);

        // a stored key under other upsert key values is no row this upsert replaces, as a database's insert reports it
        if (!replacing && stored) {
            this.abort(new EntityConflictError(this.entity));
        }

        await this.write(entity, key, row, stored);

        return this.toEntity(row);
    }

    /**
     * `upsert` of each entity in turn, in the caller's transaction or one
     * of its own: the same row and value locks, so the registry's lock
     * rules hold as for single upserts.
     */
    async upsertMany(entities: T[]): Promise<T[]> {
        this.assertWhole(entities);

        if (!this.tx) {
            return this.transaction((repository) => repository.upsertMany(entities));
        }

        const stored: T[] = [];

        for (const entity of entities) {
            stored.push(await this.upsert(entity));
        }

        return stored;
    }

    /**
     * Refuses an entity read with a field selection (`EntityQueryError`):
     * an upsert writes the whole row, so it would clear the unselected
     * fields.
     */
    protected assertWhole(entities: T[]): void {
        const partial = entities.some((entity) => this.partial.has(entity));

        if (partial) {
            throw new EntityQueryError(this.entity);
        }
    }

    /**
     * Give `row` the key of the stored row holding its values of the unique
     * group, if any: that row is the one `upsert` replaces. The group's
     * value lock, held until the transaction ends, keeps another writer of
     * the same values waiting. Resolves whether a stored row holds them.
     */
    protected async keepReplacedKey(row: EntityRecord, group: string[]): Promise<boolean> {
        await this.registry.lockValue(this.entity, group, row, this.tx!);
        this.assertOpen();

        const [replaced] = this.registry.findUnique(this.entity, group, row, this.tx).map(([, stored]) => stored);

        if (replaced) {
            for (const field of this.keyFields) {
                row[field] = replaced[field];
            }
        }

        return !!replaced;
    }

    async remove(entity: T): Promise<void> {
        await this.removeMany([entity]);
    }

    async removeMany(entities: T[]): Promise<void> {
        if (!this.tx) {
            await this.transaction((repository) => repository.removeMany(entities));

            return;
        }

        this.assertOpen();

        const removed: EntityRecord[] = [];

        for (const entity of entities) {
            const key = this.registry.keyOf(this.entity, entity);

            await this.registry.lockRow(this.entity, key, this.tx);
            this.assertOpen();

            const stored = this.registry.read(this.entity, key, this.tx);

            if (stored) {
                removed.push(stored);
                this.registry.write(this.entity, key, null, this.tx);
            }
        }

        this.assertRemovable(removed);
    }

    /**
     * The rows matching the where as the transaction sees them, each
     * locked, read again and deleted if it still matches: a row lock per
     * row, as `removeMany` takes them, so the registry's lock rules hold.
     */
    async removeManyBy(where: EntityWhere<T>): Promise<number> {
        assertWhere(this.entity, where, true);

        if (!this.tx) {
            return this.transaction((repository) => repository.removeManyBy(where));
        }

        this.assertOpen();

        const keys = this.registry.rows(this.entity, this.tx)
            .filter((row) => matches(row, where))
            .map((row) => this.registry.keyOf(this.entity, row));
        const removed: EntityRecord[] = [];

        for (const key of keys) {
            await this.registry.lockRow(this.entity, key, this.tx);
            this.assertOpen();

            const stored = this.registry.read(this.entity, key, this.tx);

            if (stored && matches(stored, where)) {
                removed.push(stored);
                this.registry.write(this.entity, key, null, this.tx);
            }
        }

        this.assertRemovable(removed);

        return removed.length;
    }

    /**
     * Like a database's foreign key, checked once the statement removed
     * every row: a removed row another row still references aborts the
     * transaction.
     */
    protected assertRemovable(removed: EntityRecord[]): void {
        const referencing = this.registry.findReferencingAny(this.entity, removed, this.tx);

        if (referencing) {
            this.abort(new EntityRelationError(referencing, this.entity));
        }
    }

    async validateRelations(data: Partial<T>): Promise<void> {
        this.assertOpen();

        const missing = this.registry.findMissingReference(this.entity, data, this.tx);

        if (missing) {
            throw new EntityRelationError(this.entity, missing.entity);
        }
    }

    async checkUniqueness(data: Partial<T>, existing?: T): Promise<void> {
        this.assertOpen();

        const groups = this.uniqueGroups.filter((fields) => fields.every((field) => data[field] !== undefined && data[field] !== null));
        const ownKey = existing ? this.registry.keyOf(this.entity, existing) : undefined;

        if (this.registry.hasConflict(this.entity, groups, data, this.tx, ownKey)) {
            throw new EntityConflictError(this.entity);
        }
    }

    async transaction<R>(fn: (repository: this) => Promise<R>): Promise<R> {
        if (this.tx) {
            return fn(this);
        }

        const transaction = this.registry.begin();
        let result: R;

        try {
            result = await fn(this.bind(transaction));
        } catch (error) {
            this.registry.rollback(transaction, error);

            throw error;
        }

        if (transaction.aborted) {
            this.registry.rollback(transaction, transaction.aborted);

            throw transaction.aborted;
        }

        this.registry.commit(transaction);

        return result;
    }

    /**
     * The rows a single-row read looks at: those holding the where's
     * values of the key or a unique group, when it names one completely
     * with plain values (an index lookup), else every row.
     */
    protected candidates(where: EntityRecord): EntityRecord[] {
        const group = this.uniqueGroups.find((fields) => fields.every((field) => {
            const value = where[field];

            return value !== undefined && value !== null && !Array.isArray(value);
        }));

        if (!group) {
            return this.registry.rows(this.entity, this.tx);
        }

        return this.registry.findUnique(this.entity, group, where, this.tx).map(([, row]) => row);
    }

    /**
     * A copy of this repository bound to the transaction; it shares the
     * identity marks of `create()` and the read snapshots.
     */
    protected bind(transaction: MemoryTransaction): this {
        const bound = Object.create(Object.getPrototypeOf(this)) as this;

        Object.assign(bound, this, { tx: transaction });

        return bound;
    }

    /**
     * A child repository of this aggregate (another table of it) bound to
     * the transaction `bind()` binds this repository to: a subclass with
     * child repositories binds each in its `bind()`, so `fn` gets them in
     * the same transaction.
     */
    protected bindChild<R extends MemoryEntityRepository<any>>(child: R, transaction: MemoryTransaction): R {
        return child.bind(transaction);
    }

    /**
     * Mark a written entity as read with its current values; a rollback of
     * the transaction restores its marks, so a retry behaves as the first
     * attempt (a created entity inserts, a read entity writes its change).
     * Called in the step that keeps the write, so the transaction is open.
     */
    protected mark(entity: T): void {
        const created = this.created.has(entity);
        const snapshot = this.snapshots.get(entity);

        this.tx!.undo.push(() => {
            if (created) {
                this.created.add(entity);
            }

            if (snapshot) {
                this.snapshots.set(entity, snapshot);
            } else {
                this.snapshots.delete(entity);
            }
        });

        this.created.delete(entity);
        this.snapshots.set(entity, structuredClone(entity));
    }

    /**
     * A copy of a stored row, remembered as read: its `save` updates.
     */
    protected toEntity(row: EntityRecord): T {
        const entity = structuredClone(row) as T;

        this.snapshots.set(entity, structuredClone(row));

        return entity;
    }

    /**
     * Check references and unique values of a row about to be written, then
     * keep the write in the transaction and mark the entity as read, both in
     * one step: a rollback never lands between them. Only a unique value
     * the write sets (new, or changed against `stored`) is locked and
     * checked, as a database's unique index only checks the entries a write
     * adds.
     */
    protected async write(entity: T, key: string, row: EntityRecord, stored?: EntityRecord): Promise<void> {
        const transaction = this.tx!;
        const missing = this.registry.findMissingReference(this.entity, row, transaction);

        if (missing) {
            this.abort(new EntityRelationError(this.entity, missing.entity));
        }

        const groups = this.registry.uniqueGroupsOf(this.entity, row)
            .filter((fields) => !stored || fields.some((field) => !isEqual(stored[field], row[field])));

        for (const fields of groups) {
            await this.registry.lockValue(this.entity, fields, row, transaction);
            this.assertOpen();
        }

        if (this.registry.hasConflict(this.entity, groups, row, transaction, key)) {
            this.abort(new EntityConflictError(this.entity));
        }

        this.registry.write(this.entity, key, row, transaction);
        this.mark(entity);
    }

    /**
     * A transaction a storage error aborted, or one that ended (a call that
     * was not awaited before it settled), refuses every further call. A
     * parallel call may abort the transaction, and `fn` may settle, while a
     * call awaits: every step after an `await` starts with this check.
     */
    protected assertOpen(): void {
        if (this.tx) {
            this.registry.assertOpen(this.entity, this.tx);
        }
    }

    /**
     * Abort the transaction with a storage error of a write: its waiting
     * requests fail and it takes no further lock.
     */
    protected abort(error: Error): never {
        this.registry.abort(this.tx!, error);

        throw error;
    }
}
