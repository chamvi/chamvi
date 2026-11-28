/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { EntityFindManyResult, IRunRepository } from '@chamvi/store';
import type { IFilter, IQuery } from '@rapiq/core';
import type {
    Run,
    RunStatusLiteral,
    TriggerEnvelope,
    WaitPoint,
} from '@chamvi/core-kit';
import type { ActorContext } from '../actor/types.ts';
import type { IClock } from '../clock/index.ts';
import type { AgentScope } from '../permission/types.ts';


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

/** A checked run listing (an API query, decoded): its filters, an optional agent, the page and the sorts. */
export type RunListInput = {
    filters: IFilter[];
    agent?: string;
    limit: number;
    offset: number;
    sorts: Record<string, 'ASC' | 'DESC'>;
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

    /**
     * The run for the actor: RunNotFoundError for a missing run and for one
     * of an agent the actor may not read under the private-agent rule (the
     * same error, so run ids are not probed), else 403 `chamvi_run_read`.
     */
    getOne(id: string, actor: ActorContext, options: AgentScope): Promise<Run>;

    /**
     * The runs of a checked listing the actor may list, else 403: one
     * `list()` query with the permission scope (an `agent` filter) joined
     * to the input's filters, so `total` and the page stay exact.
     */
    getMany(input: RunListInput, actor: ActorContext, options: AgentScope): Promise<EntityFindManyResult<Run>>;

    /**
     * The run the actor may cancel: 403 without `chamvi_run_cancel` for some
     * run, then for the found run's `{ agent }`; `undefined` for a missing run.
     */
    getCancelable(id: string, actor: ActorContext): Promise<Run | undefined>;

    /**
     * The run the actor may answer approvals of: RunNotFoundError for a
     * missing run (no read permission needed), 403 without
     * `chamvi_agent_approve` for its agent.
     */
    getAnswerable(id: string, actor: ActorContext, options: AgentScope): Promise<Run>;
}
