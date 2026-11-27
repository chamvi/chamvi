/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { EntityDeadlockError, EntityRelationError } from '@chamvi/errors';
import { isEqual } from 'smob';
import type { EntityRecord } from '@chamvi/store';
import { valueAt } from './helpers.ts';
import type {
    MemoryEntityDefinition,
    MemoryReference,
    MemoryTransaction,
} from './types.ts';

type LockWaiter = {
    entity: string;
    transaction: MemoryTransaction;
    promise: Promise<void>;
    resolve: () => void;
    reject: (reason: unknown) => void;
};

type Lock = {
    owner: MemoryTransaction;
    queue: LockWaiter[];
};

/**
 * The rows, row locks and declared references shared by the memory
 * repositories of one process: one view of every entity's rows, so a
 * reference is checked against the referenced entity's repository.
 *
 * A transaction keeps its writes apart until it commits (other callers keep
 * reading the committed rows) and locks every row it reads for update or
 * writes until it ends.
 *
 * The rules of the locks, true between any two synchronous steps and so at
 * every await point:
 *
 * 1. A lock exists exactly while a transaction owns it. The owner has not
 *    ended and names the lock in `held`; `held` names nothing else.
 * 2. The line of a lock holds one entry per waiting transaction, in request
 *    order, and never the owner. Every transaction in a line is open:
 *    neither aborted nor ended.
 * 3. A transaction in a line waits for the lock's owner and for every
 *    transaction ahead of it. These edges, read from the lines alone, never
 *    form a cycle.
 * 4. An aborted or ended transaction takes no lock, stands in no line and
 *    writes nothing. An aborted one keeps the locks it holds until it ends;
 *    an ended one holds none.
 * 5. A request is refused with `EntityDeadlockError` only when granting it
 *    a place in the line would close a cycle (rule 3), or when its
 *    transaction is aborted or ended (rule 4, with the aborting error).
 *
 * The lines change in three places only: `lock()` appends an entry after
 * the cycle check, `leave()` takes a transaction out of every line (when it
 * aborts or ends) and `release()` hands a lock to the head of its line.
 * Only the first adds edges, and it checks them. The second removes edges.
 * The third makes the head the owner: every waiter behind it already
 * waited for it. So no cycle forms, and every wait ends when the
 * transactions it waits for end.
 */
export class MemoryRegistry {
    protected tables = new Map<string, Map<string, EntityRecord>>();

    protected definitions = new Map<string, MemoryEntityDefinition>();

    protected locks = new Map<string, Lock>();

    /** Per entity, the value index of each field group looked up so far (see `indexOf`). */
    protected indexes = new Map<string, Map<string, Map<string, Set<string>>>>();

    protected sequence = 0;

    /**
     * Declare an entity's key, unique groups and references.
     */
    define(definition: MemoryEntityDefinition): void {
        this.definitions.set(definition.entity, definition);
    }

    /**
     * The row key of a record: its key fields in order.
     */
    keyOf(entity: string, record: EntityRecord): string {
        const definition = this.definitionOf(entity);

        return JSON.stringify(definition.key.map((field) => record[field] ?? null));
    }

    begin(): MemoryTransaction {
        this.sequence += 1;

        return {
            id: this.sequence,
            writes: new Map(),
            held: new Set(),
            undo: [],
        };
    }

    /**
     * The stored row as the transaction sees it (its own write first, else
     * the committed row); never hand it out without a copy.
     */
    read(entity: string, key: string, transaction?: MemoryTransaction): EntityRecord | undefined {
        const own = transaction?.writes.get(entity);

        if (own?.has(key)) {
            return own.get(key) ?? undefined;
        }

        return this.tableOf(entity).get(key);
    }

    /**
     * Every stored row of the entity as the transaction sees it; never hand
     * one out without a copy.
     */
    rows(entity: string, transaction?: MemoryTransaction): EntityRecord[] {
        const own = transaction?.writes.get(entity);

        if (!own || own.size === 0) {
            return this.tableOf(entity).values().toArray();
        }

        const merged = new Map(this.tableOf(entity));

        for (const [key, row] of own) {
            if (row === null) {
                merged.delete(key);
            } else {
                merged.set(key, row);
            }
        }

        return merged.values().toArray();
    }

    /**
     * Keep a write (a row, or `null` for a delete) in the transaction until
     * it commits. The caller holds the row's lock.
     */
    write(entity: string, key: string, row: EntityRecord | null, transaction: MemoryTransaction): void {
        // also a call that was not awaited before the transaction settled: refused, never lost silently
        this.assertOpen(entity, transaction);

        let own = transaction.writes.get(entity);

        if (!own) {
            own = new Map();
            transaction.writes.set(entity, own);
        }

        own.set(key, row);
    }

    /**
     * Lock a row (or a not yet stored key) for the transaction.
     */
    async lockRow(entity: string, key: string, transaction: MemoryTransaction): Promise<void> {
        await this.lock(entity, `${entity}\0row\0${key}`, transaction);
    }

    /**
     * Lock a value of a unique field group, so two transactions writing the
     * same unique value run one after the other. A group holding a value
     * the index cannot key (an object, an array, a bigint) is locked as a
     * whole: equal values in another key order still meet at one lock.
     */
    async lockValue(entity: string, fields: string[], record: EntityRecord, transaction: MemoryTransaction): Promise<void> {
        const value = this.valueOf(fields, record) ?? '*';

        await this.lock(entity, `${entity}\0unique\0${fields.join('\0')}\0${value}`, transaction);
    }

    /**
     * The unique groups of the record whose every value is set (a missing
     * or `null` value never conflicts).
     */
    uniqueGroupsOf(entity: string, record: EntityRecord): string[][] {
        return this.definitionOf(entity).unique
            .filter((fields) => fields.every((field) => record[field] !== undefined && record[field] !== null));
    }

    /**
     * Whether another row (by key) holds the record's values of one of the
     * given field groups.
     */
    hasConflict(entity: string, groups: string[][], record: EntityRecord, transaction?: MemoryTransaction, ownKey?: string): boolean {
        return groups.some((fields) => this.findUnique(entity, fields, record, transaction)
            .some(([key]) => key !== ownKey));
    }

    /**
     * The rows (with their keys) holding the record's values of a field
     * group, as the transaction sees them: the transaction's own writes,
     * then the committed rows it did not write, found through an index of
     * the group's values (built on first use, kept by every commit), or by
     * a scan when the record holds a value the index cannot key. The key
     * group is a row key: one lookup, never a scan of the transaction's
     * writes (a purge reads each row it removes by key in one transaction).
     */
    findUnique(entity: string, fields: string[], record: EntityRecord, transaction?: MemoryTransaction): [string, EntityRecord][] {
        const own = transaction?.writes.get(entity);
        const holds = (row: EntityRecord) => fields.every((field) => isEqual(row[field], record[field]));
        const value = this.valueOf(fields, record);

        if (value !== undefined && isEqual(fields, this.definitionOf(entity).key)) {
            // the key fields' value is the row key (keyOf)
            const row = this.read(entity, value, transaction);

            return row && holds(row) ? [[value, row]] : [];
        }

        const found: [string, EntityRecord][] = [];

        for (const [key, row] of own ?? []) {
            if (row && holds(row)) {
                found.push([key, row]);
            }
        }

        const table = this.tableOf(entity);
        const keys = value === undefined ?
            table.keys() :
            this.indexOf(entity, fields).get(value) ?? [];

        for (const key of keys) {
            const row = table.get(key);

            if (row && !own?.has(key) && holds(row)) {
                found.push([key, row]);
            }
        }

        return found;
    }

    /**
     * The first reference of the record whose referenced row is missing.
     */
    findMissingReference(entity: string, record: EntityRecord, transaction?: MemoryTransaction): MemoryReference | undefined {
        return this.definitionOf(entity).references.find((reference) => {
            const value = valueAt(record, reference.field);

            if (value === undefined || value === null) {
                return false;
            }

            return !this.read(reference.entity, JSON.stringify([value]), transaction);
        });
    }

    /**
     * The label of an entity with a row referencing the row, if any.
     */
    findReferencing(entity: string, row: EntityRecord, transaction?: MemoryTransaction): string | undefined {
        const value = row[this.definitionOf(entity).key[0]!];

        for (const definition of this.definitions.values()) {
            for (const reference of definition.references) {
                if (reference.entity !== entity) {
                    continue;
                }

                const referenced = this.rows(definition.entity, transaction)
                    .some((candidate) => isEqual(valueAt(candidate, reference.field), value));

                if (referenced) {
                    return definition.entity;
                }
            }
        }

        return undefined;
    }

    /**
     * The label of an entity with a row referencing one of the rows, if
     * any: each referencing entity's rows are scanned once.
     */
    findReferencingAny(entity: string, rows: EntityRecord[], transaction?: MemoryTransaction): string | undefined {
        if (rows.length === 0) {
            return undefined;
        }

        const field = this.definitionOf(entity).key[0]!;
        const values = rows.map((row) => row[field]);
        const plain = new Set(values.filter((value) => typeof value !== 'object' || value === null));
        const other = values.filter((value) => typeof value === 'object' && value !== null);

        for (const definition of this.definitions.values()) {
            for (const reference of definition.references) {
                if (reference.entity !== entity) {
                    continue;
                }

                const referenced = this.rows(definition.entity, transaction).some((candidate) => {
                    const value = valueAt(candidate, reference.field);

                    return plain.has(value) || other.some((item) => isEqual(item, value));
                });

                if (referenced) {
                    return definition.entity;
                }
            }
        }

        return undefined;
    }

    /**
     * Apply the transaction's writes and release its locks. The references
     * of every written and deleted row are checked first against the rows
     * the commit leaves (a parent deleted by another transaction meanwhile):
     * on a violation nothing is applied and `EntityRelationError` is thrown.
     * An aborted transaction is rolled back instead, with its aborting error.
     */
    commit(transaction: MemoryTransaction): void {
        try {
            if (transaction.aborted) {
                throw transaction.aborted;
            }

            this.assertReferences(transaction);
        } catch (error) {
            this.rollback(transaction, error);

            throw error;
        }

        for (const [entity, own] of transaction.writes) {
            const table = this.tableOf(entity);
            const indexes = this.indexes.get(entity);

            for (const [key, row] of own) {
                const stored = table.get(key);

                for (const [group, index] of indexes ?? []) {
                    const fields = JSON.parse(group) as string[];

                    const before = stored ? this.valueOf(fields, stored) : undefined;

                    if (before !== undefined) {
                        const keys = index.get(before);

                        keys?.delete(key);

                        if (keys?.size === 0) {
                            index.delete(before);
                        }
                    }

                    const after = row ? this.valueOf(fields, row) : undefined;

                    if (after !== undefined) {
                        index.set(after, (index.get(after) ?? new Set()).add(key));
                    }
                }

                if (row === null) {
                    table.delete(key);
                } else {
                    table.set(key, row);
                }
            }
        }

        this.end(transaction);
    }

    /**
     * Drop the transaction's writes, run its undo steps (latest first) and
     * release its locks; a lock request of it still waiting fails with
     * `reason`.
     */
    rollback(transaction: MemoryTransaction, reason?: unknown): void {
        for (const step of transaction.undo.toReversed()) {
            step();
        }

        this.end(transaction, reason);
    }

    /**
     * Abort the transaction with a storage error: it leaves every line (its
     * waiting requests fail with the error) and every further request or
     * write of it is refused with the error that aborted it first. It keeps
     * its locks until it is rolled back.
     */
    abort(transaction: MemoryTransaction, error: Error): void {
        transaction.aborted ??= error;

        this.leave(transaction, transaction.aborted);
    }

    /**
     * Refuse a call of an aborted transaction (with the aborting error) or
     * an ended one.
     */
    assertOpen(entity: string, transaction: MemoryTransaction): void {
        if (transaction.aborted) {
            throw transaction.aborted;
        }

        if (transaction.ended) {
            throw new EntityDeadlockError({ entity });
        }
    }

    protected assertReferences(transaction: MemoryTransaction): void {
        for (const [entity, own] of transaction.writes) {
            for (const [key, row] of own) {
                if (row) {
                    const missing = this.findMissingReference(entity, row, transaction);

                    if (missing) {
                        throw new EntityRelationError({ entity, relation: missing.entity });
                    }

                    continue;
                }

                const committed = this.tableOf(entity).get(key);
                const referencing = committed ? this.findReferencing(entity, committed, transaction) : undefined;

                if (referencing) {
                    throw new EntityRelationError({ entity: referencing, relation: entity });
                }
            }
        }
    }

    /**
     * Take the lock or wait in line for it. A request that would close a
     * cycle aborts its transaction and fails with `EntityDeadlockError`.
     */
    protected async lock(entity: string, name: string, transaction: MemoryTransaction): Promise<void> {
        this.assertOpen(entity, transaction);

        const lock = this.locks.get(name);

        if (!lock) {
            this.locks.set(name, { owner: transaction, queue: [] });
            transaction.held.add(name);

            return;
        }

        if (lock.owner === transaction) {
            return;
        }

        // a second request of a transaction already in line (parallel calls) shares its place
        let waiter = lock.queue.find((item) => item.transaction === transaction);

        if (!waiter) {
            // it would wait for the owner and for every transaction in line
            const ahead = [lock.owner, ...lock.queue.map((item) => item.transaction)];

            if (this.reaches(ahead, transaction)) {
                const error = new EntityDeadlockError({ entity });

                this.abort(transaction, error);

                throw error;
            }

            waiter = {
                entity,
                transaction,
                ...Promise.withResolvers<void>(),
            };
            lock.queue.push(waiter);
        }

        await waiter.promise;
    }

    /**
     * The transactions the transaction waits for: for every line it stands
     * in, the lock's owner and the transactions ahead of it.
     */
    protected aheadOf(transaction: MemoryTransaction): MemoryTransaction[] {
        const ahead: MemoryTransaction[] = [];

        for (const lock of this.locks.values()) {
            const index = lock.queue.findIndex((item) => item.transaction === transaction);

            if (index !== -1) {
                ahead.push(lock.owner, ...lock.queue.slice(0, index).map((item) => item.transaction));
            }
        }

        return ahead;
    }

    /**
     * Whether one of `from`, through the transactions each waits for,
     * waits for `transaction`.
     */
    protected reaches(from: MemoryTransaction[], transaction: MemoryTransaction): boolean {
        const seen = new Set<MemoryTransaction>();
        const stack = [...from];

        while (stack.length > 0) {
            const current = stack.pop()!;

            if (current === transaction) {
                return true;
            }

            if (!seen.has(current)) {
                seen.add(current);
                stack.push(...this.aheadOf(current));
            }
        }

        return false;
    }

    /**
     * Take the transaction out of every line; its waiting requests fail
     * with `reason`.
     */
    protected leave(transaction: MemoryTransaction, reason?: unknown): void {
        for (const lock of this.locks.values()) {
            const index = lock.queue.findIndex((item) => item.transaction === transaction);

            if (index !== -1) {
                const [waiter] = lock.queue.splice(index, 1);

                waiter!.reject(reason ?? new EntityDeadlockError({ entity: waiter!.entity }));
            }
        }
    }

    /**
     * Hand the lock to the head of its line, or drop it when nothing waits.
     */
    protected release(name: string): void {
        const lock = this.locks.get(name)!;
        const next = lock.queue.shift();

        if (!next) {
            this.locks.delete(name);

            return;
        }

        lock.owner = next.transaction;
        next.transaction.held.add(name);
        next.resolve();
    }

    /**
     * Mark the transaction ended, take it out of every line (failing its
     * waiting requests with `reason`) and release the locks it holds.
     */
    protected end(transaction: MemoryTransaction, reason?: unknown): void {
        transaction.ended = true;
        transaction.writes.clear();
        transaction.undo = [];

        this.leave(transaction, reason ?? transaction.aborted);

        for (const name of transaction.held) {
            this.release(name);
        }

        transaction.held.clear();
    }

    /**
     * The index of a field group's committed values (a value, as
     * `valueOf` writes it, to the keys of the rows holding it; a row whose
     * value `valueOf` cannot key is left out), built from the table on
     * first use.
     */
    protected indexOf(entity: string, fields: string[]): Map<string, Set<string>> {
        let indexes = this.indexes.get(entity);

        if (!indexes) {
            indexes = new Map();
            this.indexes.set(entity, indexes);
        }

        const group = JSON.stringify(fields);
        let index = indexes.get(group);

        if (!index) {
            index = new Map();

            for (const [key, row] of this.tableOf(entity)) {
                const value = this.valueOf(fields, row);

                if (value !== undefined) {
                    index.set(value, (index.get(value) ?? new Set()).add(key));
                }
            }

            indexes.set(group, index);
        }

        return index;
    }

    /**
     * A field group's values of a record as an index key, or undefined when
     * one of them is no string, number, boolean or null (an object or an
     * array, whose key order a string key would see, or a bigint): such a
     * row is left out of the index and such a lookup scans the rows. Rows
     * are compared again (`isEqual`) after the lookup.
     */
    protected valueOf(fields: string[], record: EntityRecord): string | undefined {
        const values = fields.map((field) => record[field] ?? null);

        const unkeyable = values.some((value) => value !== null && !['string', 'number', 'boolean'].includes(typeof value));

        if (unkeyable) {
            return undefined;
        }

        return JSON.stringify(values);
    }

    protected tableOf(entity: string): Map<string, EntityRecord> {
        let table = this.tables.get(entity);

        if (!table) {
            table = new Map();
            this.tables.set(entity, table);
        }

        return table;
    }

    protected definitionOf(entity: string): MemoryEntityDefinition {
        return this.definitions.get(entity) ?? {
            entity,
            key: ['id'],
            unique: [],
            references: [],
        };
    }
}
