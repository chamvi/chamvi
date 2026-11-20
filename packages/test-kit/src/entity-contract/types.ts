/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IEntityRepository } from '@chamvi/store';

/**
 * The parent fixture of the entity contract: key `id` (a uuid), `name`
 * unique, `note` nullable.
 */
export type EntityContractParent = {
    id: string;
    name: string;
    note: string | null;
    counter: number;
    label: string;
    createdAt: Date;
};

/**
 * The child fixture of the entity contract: key `id` (a uuid), `parentId`
 * references the parent's `id`.
 */
export type EntityContractChild = {
    id: string;
    parentId: string;
    label: string;
};

/**
 * The upsert-key fixture of the entity contract: key `id` (a uuid), the
 * pair `(scope, name)` unique and the repository's upsert key (`upsert`
 * replaces by it and keeps the stored id).
 */
export type EntityContractRecord = {
    id: string;
    scope: string;
    name: string;
    value: number;
};

export type EntityContractRepositories = {
    parents: IEntityRepository<EntityContractParent>;
    children: IEntityRepository<EntityContractChild>;
    /** Labelled `record`; `upsertKey: ['scope', 'name']`. */
    records: IEntityRepository<EntityContractRecord>;
};

export type EntityRepositoryContractInput = {
    /** Label of the suite, e.g. the driver. */
    name: string;
    /** Fresh, empty repositories per test, on one shared store. */
    create(): Promise<EntityContractRepositories>;
    /**
     * The driver runs one transaction at a time (SQLite through one
     * in-process queue): the cases that need two transactions to overlap
     * assert the serialized outcome, or are skipped where overlap is the
     * whole point (a lock cycle).
     */
    serialized?: boolean;
    /**
     * The most bind parameters one statement of the driver carries
     * (default 65535, PostgreSQL's): the split cases size their wheres
     * beyond it.
     */
    parameterLimit?: number;
};
