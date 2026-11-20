/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IQuery } from '@rapiq/core';
import { In } from 'typeorm';
import type {
    FindOptionsWhere,
    ObjectLiteral,
    SelectQueryBuilder,
} from 'typeorm';
import {
    EntityConflictError,
    EntityNotFoundError,
    EntityQueryError,
} from '@chamvi/store';
import type {
    EntityFindManyResult,
    EntityRecord,
    EntityWhere,
    IEntityRepository,
} from '@chamvi/store';
import { applyQuery } from '../query/apply.ts';
import { ENTITY_LOCK_MODES } from './constants.ts';
import { assertWhere, changedColumns } from './helpers/index.ts';
import { EntityUpsertAdapter } from './adapter/upsert.ts';

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
export abstract class EntityRepositoryAdapter<T extends EntityRecord, E extends ObjectLiteral = T>
    extends EntityUpsertAdapter<T, E>
    implements IEntityRepository<T> {
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

        // each part is in key order: the parts of a split array are merged into it,
        // a row two parts matched (values equal in SQL, not in JS: dates, uuid case) once
        if (parts.length > 1) {
            rows.sort((a, b) => this.compareKeys(a, b));

            return rows
                .filter((row, index) => index === 0 || this.compareKeys(rows[index - 1]!, row) !== 0)
                .map((row) => this.read(row));
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

    protected async findOneWhere(where: EntityRecord, operation: string): Promise<T | null> {
        if (this.mustQueue()) {
            return this.transaction((repository) => repository.findOneWhere(where, operation));
        }

        this.assertOpen(operation);

        // a locked lookup of several parts re-reads its winner with the primary key added: room for it
        const parts = this.wheresOf(where, this.locking ? this.metadata.primaryColumns.length : 0);
        const lock = this.locking ? { lock: { mode: ENTITY_LOCK_MODES[this.options.lock ?? 'update'] } } : {};
        const findFirst = (part: FindOptionsWhere<E>, locked: boolean) => this.persist(() => this.repository.findOne({
            where: part,
            order: this.primaryOrder(),
            ...(locked ? lock : {}),
        }), operation);

        if (parts.length <= 1) {
            const row = parts[0] ? await findFirst(parts[0], true) : null;

            return row ? this.read(row) : null;
        }

        // the lowest key over the parts, as one statement ordered by key; only that row is locked
        for (;;) {
            let first: { row: E; part: FindOptionsWhere<E> } | undefined;

            for (const part of parts) {
                const row = await findFirst(part, false);

                if (row && (!first || this.compareKeys(row, first.row) < 0)) {
                    first = { row, part };
                }
            }

            if (!first) {
                return null;
            }

            if (!this.locking) {
                return this.read(first.row);
            }

            // read again under the lock: the row may have changed or gone meanwhile
            const row = await findFirst({ ...first.part, ...this.keyOf(first.row as EntityRecord) }, true);

            if (row) {
                return this.read(row);
            }
        }
    }
}
