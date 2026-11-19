/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    DataSource,
    EntityManager,
    EntityMetadata,
    FindOptionsWhere,
    ObjectLiteral,
    Repository,
} from 'typeorm';
import {
    EntityConflictError,
    EntityDeadlockError,
    EntityInvalidError,
    EntityNotFoundError,
    EntityRelationError,
} from '@chamvi/store';
import type { EntityRecord } from '@chamvi/store';
import { DatabaseUnavailableError } from '../../error/unavailable.ts';
import { errorCode, errorConstraint, errorField } from '../../error/helpers.ts';
import {
    BIND_PARAMETER_LIMITS,
    CONFLICT_CODES,
    DEADLOCK_CODES,
    DEFAULT_BIND_PARAMETER_LIMIT,
    INVALID_CODES,
    INVALID_CODE_CLASSES,
    RELATION_CODES,
    SERIALIZED_DRIVERS,
    UNKNOWN_RELATION,
} from '../constants.ts';
import { isUuidColumn, isUuidValue, serialize } from '../helpers/index.ts';
import type {
    EntityForeignKey,
    EntityMarks,
    EntityRepositoryAdapterOptions,
    EntityTransaction,
} from '../types.ts';

/**
 * The storage layer of `EntityRepositoryAdapter`: the TypeORM repository,
 * its transactions and queue, reference checks and the mapping of driver
 * errors to storage errors.
 */
export abstract class EntityStorageAdapter<T extends EntityRecord, E extends ObjectLiteral = T> {
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
    protected bindTo(source: EntityStorageAdapter<T, E>, transaction: EntityTransaction): void {
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
        child: EntityStorageAdapter<C, CE>,
        source: EntityStorageAdapter<C, CE>,
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
