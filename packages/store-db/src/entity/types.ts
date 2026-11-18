/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    DataSource,
    DeepPartial,
    EntityMetadata,
    EntityTarget,
    ObjectLiteral,
} from 'typeorm';
import type { EntityRecord } from '@chamvi/store';

/**
 * The row lock a single-row read takes inside `transaction()`:
 * `update` (`FOR UPDATE`), `no-key-update` (`FOR NO KEY UPDATE`, which
 * does not block the inserts of rows referencing the locked one) or
 * `share` (`FOR SHARE`). SQLite takes none.
 */
export type EntityLockMode = 'update' | 'no-key-update' | 'share';

/**
 * The label errors use for another entity this one references or is
 * referenced by.
 */
export type EntityRelatedLabel = {
    target: EntityTarget<ObjectLiteral>;
    entity: string;
};

export type EntityRepositoryAdapterOptions<T, E> = {
    /** The entity's label in errors. */
    entity: string;
    /** The query builder alias of `findMany`. */
    alias: string;
    target: EntityTarget<E>;
    /** Default `update`. */
    lock?: EntityLockMode;
    /**
     * The stored columns of a public value (default: a copy). Also called
     * with a partial value (a where, `validateRelations`): an absent
     * property must map to absent (`undefined`) columns, never to `null`.
     */
    toEntity?(value: Partial<T>): DeepPartial<E>;
    /** The public value of a stored row (default: a copy). */
    fromEntity?(row: E): T;
    /**
     * Public field paths of a `findMany` filter or sort and the entity
     * property each reads, e.g. `{ 'claim.owner': 'claimOwner' }`; a path
     * not listed is the property of the same name.
     */
    fields?: Record<string, string>;
    /**
     * The labels of the entities this one references or that reference
     * it, so a foreign key failure names both sides by label
     * (`EntityRelationError(<referencing>, <referenced>)`). An entity not
     * listed is named by its TypeORM metadata name.
     */
    related?: EntityRelatedLabel[];
    /**
     * A unique property group `upsert` replaces by instead of the primary
     * key (`ON CONFLICT` on its columns): the row holding the same values is
     * replaced and keeps its stored primary key (a surrogate the caller
     * cannot know), which the statement returns (`RETURNING`, so the
     * driver must support it, as PostgreSQL does).
     */
    upsertKey?: string[];
};

/**
 * The identity marks of entity objects, shared by an adapter and every
 * adapter its transactions bind.
 */
export type EntityMarks = {
    /** Objects from `create()` not saved yet: `save` inserts them. */
    created: WeakSet<object>;
    /** The column values an object had when it was read or last saved. */
    snapshots: WeakMap<object, EntityRecord>;
    /** Objects read with a field selection: `upsert` and `upsertMany` refuse them. */
    partial: WeakSet<object>;
};

/**
 * One open `transaction()`: the undo of the marks it changed, the storage
 * error that aborted it, and whether it ended.
 */
export type EntityTransaction = {
    undo: (() => void)[];
    aborted?: Error;
    ended: boolean;
};

/** A foreign key of an entity's metadata. */
export type EntityForeignKey = EntityMetadata['foreignKeys'][number];

/** A column of an entity's metadata. */
export type EntityColumn = EntityMetadata['columns'][number];

/** The clock the queue's wait deadline runs on (core's `IClock` fits). */
export type QueueClock = {
    /** Epoch milliseconds. */
    now(): number;
    /** The queue calls `unref()`, when present, right after arming. */
    setTimeout(fn: () => void, ms: number): { clear(): void; unref?(): void };
};

export type QueueOptions = {
    /** How long work may wait behind one holder of the connection before it is refused (default `QUEUE_WAIT_TIMEOUT_MS`). */
    waitTimeoutMs?: number;
    /** Default: the system clock; the queue's timers never keep the process alive. */
    clock?: QueueClock;
};

/**
 * One holder of a data source's connection: a callback, a single
 * statement or an open transaction, with everything that joined it.
 */
export type QueueUnit = {
    /** The query runners whose calls are part of this unit. */
    members: WeakSet<object>;
    /** A query runner is a member: the unit lasts while its transaction is open. */
    owned: boolean;
    /** Calls and callbacks of the unit in flight. */
    holds: number;
};

export type QueueWaiter = {
    unit: QueueUnit;
    /** When it began to wait (epoch ms). */
    since: number;
    /** At the deadline it takes the connection from its holder instead of being refused (closing). */
    takeover: boolean;
    grant(): void;
    refuse(error: Error): void;
};

/** The units a piece of code runs inside, innermost first. */
export type QueueScope = {
    unit: QueueUnit;
    outer: QueueScope | undefined;
};

export type Queue = {
    dataSource: DataSource;
    /** The unit holding the connection. */
    unit: QueueUnit | undefined;
    /** When `unit` got the connection (epoch ms). */
    heldSince: number;
    waiters: QueueWaiter[];
    timer: { clear(): void } | undefined;
    clock: QueueClock;
    waitTimeoutMs: number;
};

export type SerializeOptions = {
    /** At the wait deadline, take the connection from its holder instead of failing. */
    takeover?: boolean;
};
