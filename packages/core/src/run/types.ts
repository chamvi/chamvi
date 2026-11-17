/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    IRunRepository,
    RunStatusLiteral,
    TriggerEnvelope,
    WaitPoint,
} from '@chamvi/store';
import type { IClock } from '../clock/index.ts';

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
