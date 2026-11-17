/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IQuery } from '@rapiq/core';
import { In, IsNull, Or } from 'typeorm';
import type {
    DataSource,
    EntityManager,
    EntityMetadata,
    FindOptionsOrder,
    FindOptionsWhere,
    ObjectLiteral,
    Repository,
    SelectQueryBuilder,
} from 'typeorm';
import {
    EntityConflictError,
    EntityDeadlockError,
    EntityInvalidError,
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
import { DatabaseUnavailableError } from '../error/unavailable.ts';
import { applyQuery } from '../query/apply.ts';
import { errorCode, errorConstraint, errorField } from '../error/helpers.ts';
import {
    BIND_PARAMETER_LIMITS,
    CONFLICT_CODES,
    DEADLOCK_CODES,
    DEFAULT_BIND_PARAMETER_LIMIT,
    ENTITY_LOCK_MODES,
    INVALID_CODES,
    INVALID_CODE_CLASSES,
    RELATION_CODES,
    SERIALIZED_DRIVERS,
    UNKNOWN_RELATION,
} from './constants.ts';
import {
    assertWhere,
    changedColumns,
    isJsonColumn,
    isUuidColumn,
    isUuidValue,
    serialize,
    storedJson,
} from './helpers/index.ts';
import type {
    EntityForeignKey,
    EntityMarks,
    EntityRepositoryAdapterOptions,
    EntityTransaction,
} from './types.ts';

/**
 * The base of every database repository: the generic port on a TypeORM
 * repository, configured per entity, deciding nothing.
 *
 * - `transaction(fn)` opens one database transaction and hands `fn` the
 *   adapter `withManager()` builds on its manager, with row locking on; a
 *   nested call joins. Inside, `findOneById`/`findOneBy` lock the row
 *   (the `lock` mode), `findMany`/`findManyBy` lock nothing. A storage
 *   error inside aborts the transaction (as PostgreSQL does): every later
 *   call rethrows it, and it is rethrown when `fn` resolved anyway.
 * - `save` decides by object identity: an object from `create()` is an
 *   INSERT (never TypeORM's `save`), an object from a read an UPDATE of
 *   the columns that changed since the read. A rolled back transaction
 *   restores those marks.
 * - Driver errors: a unique violation is `EntityConflictError`, a foreign
 *   key violation `EntityRelationError` (both sides named by label: the
 *   constraint name is looked up in the entity metadata), a deadlock
 *   `EntityDeadlockError`, a value the table refuses (not null, check,
 *   too long, wrong type) `EntityInvalidError` with the column or
 *   constraint name, anything else `DatabaseUnavailableError` with the
 *   driver's code only.
 * - A value that is no uuid never reaches a uuid column: an id reads as
 *   absent, a reference as a missing row, a filter value matches nothing;
 *   a date filter value that names no instant is `EntityQueryError`.
 * - On better-sqlite3 (one shared connection) every use of the data
 *   source runs in one in-process queue: an operation outside a
 *   transaction runs as a queued transaction of its own, so a
 *   transaction is never joined by unrelated work. No row is locked
 *   there; a foreign key failure names no constraint, so writes check
 *   their references (and removes the rows referencing them) first,
 *   exact while the queue holds every other caller back.
 */
export abstract class EntityRepositoryAdapter<T extends EntityRecord, E extends ObjectLiteral = T> implements IEntityRepository<T> {
    protected repository: Repository<E>;

    protected options: EntityRepositoryAdapterOptions<T, E>;

    protected marks: EntityMarks;

    /** The open transaction this adapter is bound to, if any. */
    protected tx: EntityTransaction | undefined;

    protected constructor(repository: Repository<E>, options: EntityRepositoryAdapterOptions<T, E>) {
        this.repository = repository;
        this.options = options;
        this.marks = {
            created: new WeakSet(),
            snapshots: new WeakMap(),
            partial: new WeakSet(),
        };
    }

    /**
     * The same repository on another manager (a transaction's): a new
     * adapter of the subclass with the same options.
     */
    abstract withManager(manager: EntityManager): this;

    async findMany(query: IQuery): Promise<EntityFindManyResult<T>> {
        return this.findManyWhere(query);
    }

    /**
     * `findMany` with a condition `where` adds to the query builder (an
     * AND with the query's filters): a subclass's finder for a condition
     * rapiq cannot express on every driver.
     */
    protected async findManyWhere(
        query: IQuery,
        where?: (queryBuilder: SelectQueryBuilder<E>, alias: string) => void,
    ): Promise<EntityFindManyResult<T>> {
        if (this.mustQueue()) {
            return this.transaction((repository) => repository.findManyWhere(query, where));
        }

        this.assertOpen('findMany');

        const queryBuilder = this.repository.createQueryBuilder(this.options.alias);

        where?.(queryBuilder, this.options.alias);

        const pagination = await applyQuery(queryBuilder, query, { fields: this.options.fields ?? {}, entity: this.options.entity });
        const [rows, total] = await this.persist(() => queryBuilder.getManyAndCount(), 'findMany');
        const data = rows.map((row) => this.read(row));

        // a row of some columns only: an upsert of it would write NULL to the others
        if (query.fields.value.length > 0) {
            for (const value of data) {
                this.marks.partial.add(value);
            }
        }

        return {
            data,
            meta: {
                total,
                ...(pagination.limit !== undefined ? { limit: pagination.limit } : {}),
                ...(pagination.offset !== undefined ? { offset: pagination.offset } : {}),
            },
        };
    }

    async findOneById(id: string): Promise<T | null> {
        // no key matches no row: never the first row of a where without a condition
        if (id === undefined || id === null) {
            throw new EntityQueryError(this.options.entity);
        }

        const [primary] = this.metadata.primaryColumns;

        return this.findOneWhere({ [primary!.propertyName]: id }, 'findOneById');
    }

    async findOneBy(where: EntityWhere<T>): Promise<T | null> {
        assertWhere(this.options.entity, where);

        return this.findOneWhere(this.toEntity(where as Partial<T>), 'findOneBy');
    }

    async findManyBy(where: EntityWhere<T>): Promise<T[]> {
        assertWhere(this.options.entity, where);

        if (this.mustQueue()) {
            return this.transaction((repository) => repository.findManyBy(where));
        }

        this.assertOpen('findManyBy');

        const parts = this.wheresOf(this.toEntity(where as Partial<T>));
        const rows: E[] = [];

        for (const part of parts) {
            rows.push(...await this.persist(() => this.repository.find({
                where: part,
                order: this.primaryOrder(),
            }), 'findManyBy'));
        }

        // each part is in key order: the parts of a split array are merged into it
        if (parts.length > 1) {
            rows.sort((a, b) => this.compareKeys(a, b));
        }

        return rows.map((row) => this.read(row));
    }

    create(data: Partial<T>): T {
        const entity = structuredClone(data) as T;

        this.marks.created.add(entity);

        return entity;
    }

    merge(entity: T, data: Partial<T>): T {
        return Object.assign(entity, structuredClone(data));
    }

    async save(entity: T): Promise<T> {
        if (this.mustQueue()) {
            return this.transaction((repository) => repository.save(entity));
        }

        this.assertOpen('save');

        const values = this.toEntity(entity);

        if (this.marks.created.has(entity)) {
            await this.persist(async () => {
                await this.assertReferences(values);
                await this.repository.insert(values as never);
            }, 'save');
            this.remember(entity, values);

            return this.storedOf(values);
        }

        const key = this.keyOf(values);

        if (!key) {
            throw new EntityNotFoundError(this.options.entity);
        }

        const changed = changedColumns(this.metadata, values, this.marks.snapshots.get(entity));
        const found = await this.persist(async () => {
            if (Object.keys(changed).length === 0) {
                return this.repository.exists({ where: key });
            }

            await this.assertReferences(changed);

            const result = await this.repository.update(key, changed as never);

            return result.affected !== 0;
        }, 'save');

        if (!found) {
            throw new EntityNotFoundError(this.options.entity);
        }

        this.remember(entity, values);

        return this.storedOf(values);
    }

    async upsert(entity: T): Promise<T> {
        // on PostgreSQL the statement returns its kept key (one statement); better-sqlite3 reads it back behind the queue
        if (this.mustQueue()) {
            return this.transaction((repository) => repository.upsert(entity));
        }

        this.assertOpen('upsert');
        this.assertWhole([entity]);

        const [stored] = await this.upsertChunk([entity], 'upsert');

        return stored!;
    }

    async upsertMany(entities: T[]): Promise<T[]> {
        if (entities.length === 0) {
            return [];
        }

        this.assertWhole(entities);

        // one transaction: all or nothing, also for a batch of several statements
        if (!this.tx) {
            return this.transaction((repository) => repository.upsertMany(entities));
        }

        this.assertOpen('upsertMany');

        const stored: T[] = [];

        for (const chunk of this.upsertChunks(entities)) {
            stored.push(...await this.upsertChunk(chunk, 'upsertMany'));
        }

        return stored;
    }

    /**
     * The entities in statements of at most the driver's bind parameters,
     * a new statement where a key (or the upsert key) repeats: one
     * statement may not replace a row twice.
     */
    protected upsertChunks(entities: T[]): T[][] {
        const columns = this.metadata.columns.filter((column) => !column.embeddedMetadata).length;
        const size = Math.max(1, Math.floor(this.parameterLimit / Math.max(1, columns)));
        const conflict = this.options.upsertKey ?? this.metadata.primaryColumns.map((column) => column.propertyName);
        const chunks: T[][] = [];
        let chunk: T[] = [];
        let seen = new Set<string>();

        for (const entity of entities) {
            const values = this.toEntity(entity);
            const key = JSON.stringify(conflict.map((property) => values[property] ?? null));

            if (chunk.length >= size || seen.has(key)) {
                chunks.push(chunk);
                chunk = [];
                seen = new Set();
            }

            chunk.push(entity);
            seen.add(key);
        }

        chunks.push(chunk);

        return chunks;
    }

    /** One statement: insert or replace each entity by key (or the upsert key); no condition. */
    protected async upsertChunk(entities: T[], operation: string): Promise<T[]> {
        const primary = this.metadata.primaryColumns;
        const items = entities.map((entity) => {
            const values = this.toEntity(entity);
            // a replace: every column the value leaves out is written as NULL, as memory stores the value alone
            const row = {
                ...changedColumns(this.metadata, values),
                ...Object.fromEntries(primary.map((column) => [column.propertyName, values[column.propertyName]])),
            };

            return {
                entity,
                values,
                row,
            };
        });
        const { upsertKey } = this.options;

        await this.persist(async () => {
            for (const item of items) {
                await this.assertReferences(item.row);
            }

            const rows = items.map((item) => item.row);

            if (!upsertKey) {
                await this.repository.upsert(rows as never, {
                    conflictPaths: primary.map((column) => column.propertyName),
                    skipUpdateIfNoValuesChanged: false,
                });

                return;
            }

            const conflict = upsertKey.map((property) => this.metadata.findColumnWithPropertyName(property)!);
            const overwrite = this.metadata.columns
                .filter((column) => !column.isPrimary && !column.embeddedMetadata && !conflict.includes(column))
                .map((column) => column.databaseName);
            const statement = this.repository.createQueryBuilder()
                .insert()
                .values(rows as never)
                .orUpdate(overwrite, conflict.map((column) => column.databaseName))
                .updateEntity(false);
            // a replaced row keeps its primary key: read it back by the upsert key, never by the position of a returned row
            const kept = new Map<string, { key: EntityRecord; values: EntityRecord }>();
            // the database keeps a uuid in its canonical lower case: compare the key as it stores it
            const upsertKeyOf = (values: EntityRecord) => JSON.stringify(conflict.map((column) => {
                const value = values[column.propertyName] ?? null;

                return isUuidColumn(column) && typeof value === 'string' ? value.toLowerCase() : value;
            }));

            if (this.serialized) {
                // no RETURNING on this driver: read each row by its upsert key, exact behind the queue
                await statement.execute();

                for (const item of items) {
                    const where = Object.fromEntries(upsertKey.map((property) => [property, item.values[property]]));
                    const found = await this.repository.findOne({
                        select: Object.fromEntries(primary.map((column) => [column.propertyName, true])) as never,
                        where: where as FindOptionsWhere<E>,
                    });

                    if (found) {
                        kept.set(upsertKeyOf(item.values), { key: found as EntityRecord, values: {} });
                    }
                }
            } else {
                const { driver } = this.dataSource;
                // a raw column list: TypeORM's list form drops a column a relation's join column shares
                const result = await statement
                    .returning([...primary, ...conflict].map((column) => driver.escape(column.databaseName)).join(', '))
                    .execute();

                for (const stored of result.raw as EntityRecord[]) {
                    const values = Object.fromEntries(conflict.map((column) => [column.propertyName, stored[column.databaseName]]));
                    const key = Object.fromEntries(primary.map((column) => [column.propertyName, stored[column.databaseName]]));

                    kept.set(upsertKeyOf(values), { key, values });
                }
            }

            for (const item of items) {
                const stored = kept.get(upsertKeyOf(item.values));

                // every upserted row is returned or read back: a missing one is a failed statement, never a guessed key
                if (!stored) {
                    throw new DatabaseUnavailableError(operation);
                }

                // the stored primary key, and the upsert key as the database keeps it
                Object.assign(item.values, stored.values);

                for (const column of primary) {
                    item.values[column.propertyName] = stored.key[column.propertyName];
                }
            }
        }, operation);

        return items.map((item) => {
            this.remember(item.entity, item.values);

            return this.storedOf(item.values);
        });
    }

    async remove(entity: T): Promise<void> {
        await this.removeMany([entity]);
    }

    async removeMany(entities: T[]): Promise<void> {
        const { primaryColumns } = this.metadata;
        const statements = primaryColumns.length === 1 ? Math.ceil(entities.length / this.parameterLimit) : entities.length;

        // several statements apply together or not at all
        if (this.mustQueue() || (!this.tx && statements > 1)) {
            await this.transaction((repository) => repository.removeMany(entities));

            return;
        }

        this.assertOpen('remove');

        const keys = entities
            .map((entity) => this.keyOf(this.toEntity(entity)))
            .filter((key) => key !== undefined);

        if (keys.length === 0) {
            return;
        }

        await this.persist(async () => {
            if (this.serialized) {
                await this.assertNotReferenced(keys);
            }

            if (primaryColumns.length === 1) {
                const property = primaryColumns[0]!.propertyName;
                const values = keys.map((key) => (key as EntityRecord)[property]);

                for (let i = 0; i < values.length; i += this.parameterLimit) {
                    await this.repository.delete({ [property]: In(values.slice(i, i + this.parameterLimit)) } as FindOptionsWhere<E>);
                }

                return;
            }

            for (const key of keys) {
                await this.repository.delete(key);
            }
        }, 'remove');
    }

    async removeManyBy(where: EntityWhere<T>): Promise<number> {
        assertWhere(this.options.entity, where, true);

        const parts = this.wheresOf(this.toEntity(where as Partial<T>));

        // a where the mapping leaves without a condition (a property no column holds) never becomes a DELETE of every row
        const unconditional = parts.some((part) => Object.keys(part).length === 0);

        if (unconditional) {
            throw new EntityQueryError(this.options.entity);
        }

        if (this.mustQueue() || (!this.tx && parts.length > 1)) {
            // several statements apply together or not at all
            return this.transaction((repository) => repository.removeManyBy(where));
        }

        this.assertOpen('removeManyBy');

        return this.persist(async () => {
            let count = 0;

            for (const part of parts) {
                if (this.serialized) {
                    // the foreign key failure names no constraint here: refuse a referenced row first, exact behind the queue
                    const rows = await this.repository.find({ where: part });

                    await this.assertNotReferenced(rows.map((row) => this.keyOf(row as EntityRecord)!));
                }

                const result = await this.repository.createQueryBuilder()
                    .delete()
                    .where(part)
                    .execute();

                count += result.affected ?? 0;
            }

            return count;
        }, 'removeManyBy');
    }

    async validateRelations(data: Partial<T>): Promise<void> {
        if (this.mustQueue()) {
            await this.transaction((repository) => repository.validateRelations(data));

            return;
        }

        this.assertOpen('validateRelations');

        const values = this.toEntity(data);
        const missing = await this.persist(() => this.findMissingReference(values, true), 'validateRelations');

        if (missing) {
            throw this.relationError(missing);
        }
    }

    async checkUniqueness(data: Partial<T>, existing?: T): Promise<void> {
        if (this.mustQueue()) {
            await this.transaction((repository) => repository.checkUniqueness(data, existing));

            return;
        }

        this.assertOpen('checkUniqueness');

        const values = this.toEntity(data);
        const own = existing ? this.keyOf(this.toEntity(existing)) : undefined;

        for (const group of this.uniqueGroups()) {
            const where: EntityRecord = {};

            for (const property of group) {
                where[property] = values[property];
            }

            const incomplete = Object.values(where).some((value) => value === undefined || value === null);
            const findWhere = incomplete ? undefined : this.toFindWhere(where);

            if (!findWhere) {
                continue;
            }

            const found = await this.persist(() => this.repository.findOne({ where: findWhere }), 'checkUniqueness');

            if (found && (!own || !this.isKey(found, own))) {
                throw new EntityConflictError(this.options.entity);
            }
        }
    }

    async transaction<R>(fn: (repository: this) => Promise<R>): Promise<R> {
        if (this.tx) {
            this.assertOpen('transaction');

            return fn(this);
        }

        const { dataSource } = this;
        const transaction: EntityTransaction = { undo: [], ended: false };
        let failure: { error: unknown } | undefined;

        const run = () => dataSource.transaction(async (manager) => {
            const bound = this.withManager(manager);

            bound.bindTo(this, transaction);

            try {
                const result = await fn(bound);

                if (transaction.aborted) {
                    throw transaction.aborted;
                }

                return result;
            } catch (error) {
                failure = { error };

                throw error;
            } finally {
                transaction.ended = true;
            }
        });

        try {
            return await (this.serialized ? serialize(dataSource, run) : run());
        } catch (error) {
            transaction.ended = true;

            for (const undo of transaction.undo.reverse()) {
                undo();
            }

            if (failure && failure.error === error) {
                throw error;
            }

            throw this.toStorageError(error, 'transaction');
        }
    }

    /**
     * Run database work and report its failure as a storage error (see
     * the class comment); inside a transaction the error aborts it. A
     * subclass runs every write of its own through here. Outside a
     * transaction on better-sqlite3 the work is queued (work already
     * queued joins).
     */
    protected async persist<O>(write: () => Promise<O>, operation = 'write'): Promise<O> {
        if (!this.tx && this.serialized) {
            return serialize(this.dataSource, () => this.execute(write, operation));
        }

        return this.execute(write, operation);
    }

    protected async execute<O>(write: () => Promise<O>, operation: string): Promise<O> {
        this.assertOpen(operation);

        try {
            return await write();
        } catch (error) {
            const mapped = this.toStorageError(error, operation);

            if (this.tx && !this.tx.aborted) {
                this.tx.aborted = mapped;
            }

            throw mapped;
        }
    }

    /**
     * Bind this adapter (fresh from `withManager()`) to a transaction of
     * `source`: it shares the source's identity marks and locks rows.
     */
    protected bindTo(source: EntityRepositoryAdapter<T, E>, transaction: EntityTransaction): void {
        this.marks = source.marks;
        this.tx = transaction;
    }

    /**
     * Bind a child repository of this aggregate (another table of it,
     * built by this adapter's `withManager()` on the same manager) to the
     * transaction this adapter is bound to: a subclass with child
     * repositories binds each in its `bindTo()`, so `fn` gets them in the
     * same transaction, and a storage error of one aborts it for all.
     */
    protected bindChild<C extends EntityRecord, CE extends ObjectLiteral>(
        child: EntityRepositoryAdapter<C, CE>,
        source: EntityRepositoryAdapter<C, CE>,
    ): void {
        child.bindTo(source, this.tx!);
    }

    protected get dataSource(): DataSource {
        return this.repository.manager.connection;
    }

    protected get metadata(): EntityMetadata {
        return this.repository.metadata;
    }

    /** One shared connection: every use runs in the data source's queue. */
    protected get serialized(): boolean {
        return SERIALIZED_DRIVERS.includes(this.dataSource.options.type);
    }

    /** Single-row reads lock: inside a transaction, on a driver with row locks. */
    protected get locking(): boolean {
        return this.tx !== undefined && !this.serialized;
    }

    /** An operation outside a transaction on a serialized driver runs as a queued transaction. */
    protected mustQueue(): boolean {
        return !this.tx && this.serialized;
    }

    /** The bind parameters one statement may carry on this driver. */
    protected get parameterLimit(): number {
        return BIND_PARAMETER_LIMITS[this.dataSource.options.type] ?? DEFAULT_BIND_PARAMETER_LIMIT;
    }

    /**
     * Entity values as TypeORM wheres (see `toFindWhere`), the longest
     * array split so no statement carries more values than the driver
     * binds; none when nothing can match.
     */
    protected wheresOf(values: EntityRecord): FindOptionsWhere<E>[] {
        const half = Math.floor(this.parameterLimit / 2);
        const [property] = Object.entries(values)
            .filter(([, value]) => Array.isArray(value) && value.length > half)
            .map(([key]) => key);

        if (property === undefined) {
            const where = this.toFindWhere(values);

            return where ? [where] : [];
        }

        const items = values[property] as unknown[];
        const wheres: FindOptionsWhere<E>[] = [];

        for (let i = 0; i < items.length; i += half) {
            const where = this.toFindWhere({ ...values, [property]: items.slice(i, i + half) });

            if (where) {
                wheres.push(where);
            }
        }

        return wheres;
    }

    /** Rows in the order of their primary key (as `primaryOrder()`). */
    protected compareKeys(a: ObjectLiteral, b: ObjectLiteral): number {
        for (const column of this.metadata.primaryColumns) {
            const left = a[column.propertyName];
            const right = b[column.propertyName];

            if (left < right) {
                return -1;
            }

            if (left > right) {
                return 1;
            }
        }

        return 0;
    }

    protected assertOpen(operation: string): void {
        if (!this.tx) {
            return;
        }

        if (this.tx.aborted) {
            throw this.tx.aborted;
        }

        if (this.tx.ended) {
            throw new DatabaseUnavailableError(operation);
        }
    }

    protected async findOneWhere(where: EntityRecord, operation: string): Promise<T | null> {
        if (this.mustQueue()) {
            return this.transaction((repository) => repository.findOneWhere(where, operation));
        }

        this.assertOpen(operation);

        const findWhere = this.toFindWhere(where);

        if (!findWhere) {
            return null;
        }

        const lock = ENTITY_LOCK_MODES[this.options.lock ?? 'update'];
        const row = await this.persist(() => this.repository.findOne({
            where: findWhere,
            order: this.primaryOrder(),
            ...(this.locking ? { lock: { mode: lock } } : {}),
        }), operation);

        return row ? this.read(row) : null;
    }

    /** The stored columns of a (partial) public value, a copy. */
    protected toEntity(value: Partial<T>): EntityRecord {
        return (this.options.toEntity ? this.options.toEntity(value) : structuredClone(value)) as EntityRecord;
    }

    /**
     * The public value of the row these column values store, as a read
     * returns it (no round trip): an absent column is NULL and a JSON column
     * holds what its parameter serializes to (a `Date` becomes a string, an
     * `undefined` property is dropped). Marked as read.
     */
    protected storedOf(values: EntityRecord): T {
        const row: EntityRecord = {};

        for (const column of this.metadata.columns) {
            if (column.embeddedMetadata) {
                continue;
            }

            const value = values[column.propertyName];

            row[column.propertyName] = isJsonColumn(column) ? storedJson(column, value) : value ?? null;
        }

        return this.read(row as E);
    }

    /**
     * Refuses a value read with a field selection (`EntityQueryError`): an
     * upsert writes every column, so it would clear the unselected ones.
     */
    protected assertWhole(entities: T[]): void {
        const partial = entities.some((entity) => this.marks.partial.has(entity));

        if (partial) {
            throw new EntityQueryError(this.options.entity);
        }
    }

    /** The public value of a row, remembered as read: its `save` updates. */
    protected read(row: E): T {
        const value = this.options.fromEntity ? this.options.fromEntity(row) : structuredClone({ ...row }) as unknown as T;

        this.marks.snapshots.set(value, structuredClone(this.toEntity(value)));

        return value;
    }

    /**
     * Mark a written entity as read with these column values; a rollback
     * of the transaction restores its marks, so a retry behaves as the
     * first attempt (a created entity inserts, a read entity writes its
     * change).
     */
    protected remember(entity: T, values: EntityRecord): void {
        const { created, snapshots } = this.marks;
        const wasCreated = created.has(entity);
        const snapshot = snapshots.get(entity);

        this.tx?.undo.push(() => {
            if (wasCreated) {
                created.add(entity);
            }

            if (snapshot) {
                snapshots.set(entity, snapshot);
            } else {
                snapshots.delete(entity);
            }
        });

        created.delete(entity);
        snapshots.set(entity, structuredClone(values));
    }

    /**
     * Entity values as a TypeORM where: `null` is `IS NULL`, an array is
     * `IN` (or `IS NULL` for a `null` in it); a non-uuid value on a uuid
     * column matches nothing (dropped from an array). `undefined` when
     * nothing can match.
     */
    protected toFindWhere(values: EntityRecord): FindOptionsWhere<E> | undefined {
        const where: EntityRecord = {};

        for (const [property, value] of Object.entries(values)) {
            if (value === undefined) {
                continue;
            }

            const uuid = isUuidColumn(this.metadata.findColumnWithPropertyName(property));

            if (Array.isArray(value)) {
                // a null in the array matches a missing value, as a null value does
                const nullable = value.includes(null);
                const items = value.filter((item) => item !== null && (!uuid || isUuidValue(item)));

                if (items.length === 0 && !nullable) {
                    return undefined;
                }

                if (!nullable) {
                    where[property] = In(items);
                } else {
                    where[property] = items.length > 0 ? Or(In(items), IsNull()) : IsNull();
                }
            } else if (value === null) {
                where[property] = IsNull();
            } else if (uuid && !isUuidValue(value)) {
                return undefined;
            } else {
                where[property] = value;
            }
        }

        return where as FindOptionsWhere<E>;
    }

    /** The primary key of entity values as a where; `undefined` when it cannot match a row. */
    protected keyOf(values: EntityRecord): FindOptionsWhere<E> | undefined {
        const key: EntityRecord = {};

        for (const column of this.metadata.primaryColumns) {
            const value = values[column.propertyName];

            if (value === undefined || value === null || (isUuidColumn(column) && !isUuidValue(value))) {
                return undefined;
            }

            key[column.propertyName] = value;
        }

        return key as FindOptionsWhere<E>;
    }

    protected isKey(row: ObjectLiteral, key: FindOptionsWhere<E>): boolean {
        return this.metadata.primaryColumns
            .every((column) => row[column.propertyName] === (key as EntityRecord)[column.propertyName]);
    }

    protected primaryOrder(): FindOptionsOrder<E> {
        return Object.fromEntries(this.metadata.primaryColumns.map((column) => [column.propertyName, 'ASC'])) as FindOptionsOrder<E>;
    }

    /** The primary key and every unique constraint or index, as property names. */
    protected uniqueGroups(): string[][] {
        const groups = [
            this.metadata.primaryColumns,
            ...this.metadata.uniques.map((unique) => unique.columns),
            ...this.metadata.indices.filter((index) => index.isUnique).map((index) => index.columns),
        ].map((columns) => columns.map((column) => column.propertyName));
        const seen = new Set<string>();

        return groups.filter((group) => {
            const id = group.join('\0');

            if (seen.has(id)) {
                return false;
            }

            seen.add(id);

            return true;
        });
    }

    /**
     * Refuse a write whose references cannot hold: a non-uuid value of a
     * uuid reference is always refused (it never reaches the driver), a
     * missing row only on a serialized driver, whose foreign key failure
     * names no constraint (PostgreSQL's foreign key reports it with one).
     */
    protected async assertReferences(values: EntityRecord): Promise<void> {
        const missing = await this.findMissingReference(values, this.serialized);

        if (missing) {
            throw this.relationError(missing);
        }
    }

    /**
     * The first foreign key of this entity whose referenced row does not
     * exist for `values` (only keys whose columns all hold a value); with
     * `query` false only the non-uuid check runs.
     */
    protected async findMissingReference(values: EntityRecord, query: boolean): Promise<EntityForeignKey | undefined> {
        for (const foreignKey of this.metadata.foreignKeys) {
            const where: EntityRecord = {};
            let complete = true;
            let impossible = false;

            for (const [index, column] of foreignKey.columns.entries()) {
                const value = values[column.propertyName];

                if (value === undefined || value === null) {
                    complete = false;

                    break;
                }

                if (isUuidColumn(column) && !isUuidValue(value)) {
                    impossible = true;
                }

                where[foreignKey.referencedColumns[index]!.propertyName] = value;
            }

            if (!complete) {
                continue;
            }

            if (impossible) {
                return foreignKey;
            }

            if (query) {
                const exists = await this.repository.manager
                    .getRepository(foreignKey.referencedEntityMetadata.target)
                    .exists({ where });

                if (!exists) {
                    return foreignKey;
                }
            }
        }

        return undefined;
    }

    /**
     * Refuse removing rows another row still references (only needed where
     * a foreign key failure names no constraint); a cascading or nulling
     * foreign key never refuses.
     */
    protected async assertNotReferenced(keys: FindOptionsWhere<E>[]): Promise<void> {
        for (const metadata of this.dataSource.entityMetadatas) {
            for (const foreignKey of metadata.foreignKeys) {
                if (
                    foreignKey.referencedEntityMetadata !== this.metadata ||
                    foreignKey.onDelete === 'CASCADE' ||
                    foreignKey.onDelete === 'SET NULL'
                ) {
                    continue;
                }

                for (const key of keys) {
                    const where: EntityRecord = {};

                    for (const [index, column] of foreignKey.columns.entries()) {
                        where[column.propertyName] = (key as EntityRecord)[foreignKey.referencedColumns[index]!.propertyName];
                    }

                    if (await this.repository.manager.getRepository(metadata.target).exists({ where })) {
                        throw this.relationError(foreignKey);
                    }
                }
            }
        }
    }

    /** A foreign key failure: the referencing entity's label, then the referenced one's. */
    protected relationError(foreignKey: EntityForeignKey): EntityRelationError {
        return new EntityRelationError(
            this.labelOf(foreignKey.entityMetadata),
            this.labelOf(foreignKey.referencedEntityMetadata),
        );
    }

    protected labelOf(metadata: EntityMetadata): string {
        if (metadata === this.metadata) {
            return this.options.entity;
        }

        const related = (this.options.related ?? []).find((item) => this.dataSource.hasMetadata(item.target) &&
            this.dataSource.getMetadata(item.target) === metadata);

        return related ? related.entity : metadata.name;
    }

    /**
     * A failed database call as a storage error: never the driver's
     * error, its message, statement or parameters.
     */
    protected toStorageError(error: unknown, operation: string): Error {
        if (
            error instanceof EntityConflictError ||
            error instanceof EntityDeadlockError ||
            error instanceof EntityInvalidError ||
            error instanceof EntityNotFoundError ||
            error instanceof EntityRelationError ||
            error instanceof DatabaseUnavailableError
        ) {
            return error;
        }

        const code = errorCode(error);

        if (code && CONFLICT_CODES.includes(code)) {
            return new EntityConflictError(this.options.entity);
        }

        if (code && RELATION_CODES.includes(code)) {
            const constraint = errorConstraint(error);
            const foreignKey = constraint ?
                this.dataSource.entityMetadatas
                    .flatMap((metadata) => metadata.foreignKeys)
                    .find((item) => item.name === constraint) :
                undefined;

            return foreignKey ?
                this.relationError(foreignKey) :
                new EntityRelationError(this.options.entity, UNKNOWN_RELATION);
        }

        if (code && DEADLOCK_CODES.includes(code)) {
            return new EntityDeadlockError(this.options.entity);
        }

        if (code && (INVALID_CODES.includes(code) || INVALID_CODE_CLASSES.includes(code.slice(0, 2)))) {
            return new EntityInvalidError(this.options.entity, operation, errorField(error));
        }

        return new DatabaseUnavailableError(operation, code);
    }
}
