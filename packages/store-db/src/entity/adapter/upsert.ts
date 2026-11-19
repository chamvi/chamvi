/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { FindOptionsWhere, ObjectLiteral } from 'typeorm';
import type { EntityRecord } from '@chamvi/store';
import { DatabaseUnavailableError } from '../../error/unavailable.ts';
import { changedColumns, isUuidColumn } from '../helpers/index.ts';
import { EntityRowAdapter } from './rows.ts';

/**
 * The upsert layer of `EntityRepositoryAdapter`: `upsert` and
 * `upsertMany`, in statements within the driver's bind parameters.
 */
export abstract class EntityUpsertAdapter<T extends EntityRecord, E extends ObjectLiteral = T> extends EntityRowAdapter<T, E> {
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
}
