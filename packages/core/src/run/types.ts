/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    EntityFindManyResult,
    IRunRepository,
    Run,
    RunStatusLiteral, 
    TriggerEnvelope, 
    WaitPoint, 
} from '@chamvi/store';
import type { IClock } from '../clock/index.ts';
import type { IQuery } from '@rapiq/core';

export type Budget = {
    maxSteps: number;
    maxTokens?: number;
    /**
     * Wall-clock limit per execution (not cumulative across resumes): each
     * execution of the run gets the full timeout again.
     */
    timeoutMs?: number;
    /**
     * Total tokens (input + output) of every descendant dispatched below a
     * run of this agent: at or over it, dispatch() and dispatchTo() refuse
     * (checked at dispatch time only, running children are not stopped).
     */
    maxSubtreeTokens?: number;
};

export type RunContext = {
    runId: string;
    agent: string;
    trigger: TriggerEnvelope;
    /** Aborts on cancel, drain, a lost lease or the run timeout, and once the execution has ended. */
    signal: AbortSignal;
};

export type RunServiceContext = {
    repository: IRunRepository;
    clock: IClock;
};

export type RunFindOptions = {
    agent?: string;
    /** Only the runs of these agents (an empty list matches none; an AND with `agent`). */
    agents?: readonly string[];
    status?: RunStatusLiteral[];
    concurrencyKey?: string;
    /** Only these run ids (an empty list matches none). */
    ids?: readonly string[];
    /** Only the runs dispatched by this run (`Run.parentRunId`). */
    parentRunId?: string;
    /** Only the runs dispatched by one of these runs (an empty list matches none). */
    parentRunIds?: readonly string[];
    /** Only the runs dispatched by some run (`true`, `Run.parentRunId` set) or by none (`false`). */
    hasParent?: boolean;
    /** Only the runs whose wait point (`Run.waiting`) is of this kind. */
    waitKind?: WaitPoint['kind'];
    limit?: number;
    offset?: number;
    order?: 'asc' | 'desc';
};

export type RunUpdateOptions = {
    expectStatus?: RunStatusLiteral[];
    expectOwner?: string;
    expectWaitId?: string;
    /** Keep the stored updatedAt when the patch sets none (default: stamped with now), for derived fields such as subtreeUsage. */
    keepUpdatedAt?: boolean;
};

/**
 * The operations of `RunService`. Anything that satisfies it can stand in
 * for the service: the engine, the channels and the HTTP API take this type.
 */
export interface IRunService {
    /**
     * Insert-if-absent: false when a run with that id is stored (the stored
     * run is left as it is). `parentRunId` comes from `trigger.parent.runId`,
     * never from the caller; a parent the store does not hold is
     * RunNotFoundError and nothing is written.
     */
    create(run: Run): Promise<boolean>;

    findOne(id: string): Promise<Run | undefined>;

    findOneOrFail(id: string): Promise<Run>;

    /**
     * Throws InvalidRunStateError when `expectStatus` does not hold the
     * current status, when `expectOwner` is given and the claim is absent or
     * held by another owner (expiry is not checked: a lease is lost once
     * taken over), or when `expectWaitId` is given and the wait id (`id`,
     * else `approvalId`) differs. `updatedAt` is stamped with now unless the
     * patch sets one or `keepUpdatedAt`; `id` and `parentRunId` never
     * change; a property set to `undefined` is cleared.
     */
    update(id: string, patch: Partial<Run>, expect?: RunUpdateOptions): Promise<Run>;

    /**
     * update() with the patch derived from a copy of the locked row, after
     * the checks (`derive` may throw to abort the write): a change to a
     * nested field (`waiting`) keeps what a concurrent write stored next to it.
     */
    updateWith(id: string, derive: (run: Run) => Partial<Run>, expect?: RunUpdateOptions): Promise<Run>;

    /**
     * Ordered by createdAt, ties broken by id, both ascending (`order`
     * `asc`, the default) or both descending; `total` ignores limit and
     * offset. Without `limit`, every matching run (from `offset`).
     */
    find(options?: RunFindOptions): Promise<{ data: Run[]; total: number }>;

    /** As `find`; RepositoryNotFoundError when the selected page is empty, even with a nonzero total. */
    findOrFail(options?: RunFindOptions): Promise<{ data: Run[]; total: number }>;

    /**
     * A rapiq query over the public run fields (filters, sorts, pagination),
     * for an API listing. A top-level `waiting` filter (`eq` with `approval`
     * or `dispatch`) selects the runs whose wait point is of that kind; a
     * `waiting` condition of any other shape is a ValidationError. Ordered
     * by the query's sorts, then by `id` in the direction of the last one
     * (createdAt, then id, ascending without sorts); `meta.total` ignores
     * the pagination.
     */
    list(query: IQuery): Promise<EntityFindManyResult<Run>>;

    /** Succeeds only when the run is unleased or its lease expired (at exactly `expiresAt`). */
    claim(id: string, owner: string, ttlMs: number): Promise<boolean>;

    /** Extends the lease to now + ttlMs; only for the current, unexpired owner. */
    renewClaim(id: string, owner: string, ttlMs: number): Promise<boolean>;
}
