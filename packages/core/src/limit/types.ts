/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ILimitRepository } from '@chamvi/store';
import type { IClock } from '../clock/index.ts';
import type { IEngine } from '../engine/types.ts';
import type { ILockService } from '../lock/types.ts';
import type { StateSchema } from '../state/types.ts';
import type { ToolContext } from '../tool/types.ts';

/**
 * A rate limit of a tool: at most `max` counted calls (weights) per agent
 * in a sliding window of `windowMs`. A tool's own `limit` is a default the
 * agent's `limits` entry replaces whole.
 */
export type ToolLimit<I = any, S extends StateSchema = StateSchema> = {
    /** The most weight the calls in one window may count; an integer from 1 to 2^31 - 1. */
    max: number;
    /** The window in milliseconds; a safe integer from 1 to APPROVAL_TIMEOUT_MAX_MS. */
    windowMs: number;
    /** What a call over the limit gets: an approval request (default) or a denial. */
    onExceed?: 'approve' | 'deny';
    /**
     * Counts the calls of every tool of the agent naming the same bucket
     * together (agent-name rule); default the tool name.
     */
    bucket?: string;
    /** How much of the limit a call takes, on its final input; an integer from 1 to 2^31 - 1, default 1. */
    weight?: (input: I, ctx: ToolContext<S>) => number | Promise<number>;
    /**
     * The body of the approval a call over the limit asks for. It reaches the
     * run's source chat only when the source channel reports the address as
     * direct (`IChannel.direct`); otherwise the source gets a generic
     * notification and the body stays in the inbox and the API.
     */
    detail?: (input: I, ctx: ToolContext<S>) => string | undefined | Promise<string | undefined>;
};

/** Per tool name, the limit replacing the tool's own one, or false to turn it off. */
export type AgentLimits = Record<string, ToolLimit | false>;

export type LimitServiceContext = {
    repository: ILimitRepository;
    /** Read for each use and each count: a use leaves a window at exactly its creation time + the window. */
    clock: IClock;
};

/**
 * The operations of `LimitService`. Anything that satisfies it can stand in
 * for the service: the engine takes this type.
 */
export interface ILimitService {
    /** The summed weight of the uses of `scope` created in the last `windowMs` before now; one read. */
    used(scope: string, windowMs: number): Promise<number>;

    /**
     * Whether a use of `scope` under `key` is stored, whatever its age (one
     * read): a call whose use was recorded but whose effect marker is missing
     * is not counted or checked again.
     */
    has(scope: string, key: string): Promise<boolean>;

    /**
     * Counts a use of `scope` under `key` created now, unless a use of that
     * `(scope, key)` is stored already (the call was counted).
     */
    record(scope: string, key: string, weight: number): Promise<void>;

    /**
     * Deletes the uses no window counts at `now` (default: the clock's time):
     * those created at or before `now` minus the longest window; resolves how many.
     */
    purgeExpired(now?: Date): Promise<number>;
}

/** What wrapToolsForRun needs to enforce tool limits (internal). */
export type ToolLimitOptions = {
    /** The agent's `limits`: each entry replaces the tool's own limit, false turns it off. */
    agent?: AgentLimits;
    /** Where the uses, the lock and the time come from, and the source channel of the approval. */
    engine: Pick<IEngine, 'limitService' | 'lockService' | 'clock' | 'getChannel'>;
};

/** One limit check of a tool call (internal): see enforceToolLimit(). */
export type EnforceToolLimitInput = {
    name: string;
    limit: ToolLimit;
    /** `<agent>:<bucket ?? name>`, hashed when longer than the store column. */
    scope: string;
    /** The final input of the call, after the agent's beforeToolExecution hook. */
    final: unknown;
    ctx: ToolContext;
    /** `<runId>:<stepIndex>:<stableHash(toolCallId)>`: the call's use within the scope. */
    key: string;
    service: ILimitService;
    locks: ILockService;
    clock: IClock;
    /** Where the approval of a call over the limit goes (limitApprovalTarget()); absent: the inbox only. */
    target?: () => Promise<LimitApprovalTarget>;
    /** Aborts a wait for the scope's lock. */
    signal?: AbortSignal;
};

/** Checks one call of a limited tool on its final input (internal). */
export type ToolLimitCheck = (final: unknown) => Promise<void>;

/**
 * The destination of a limit approval (internal): the run's source channel
 * and address, and the generic notification sent there in place of the
 * private body (`detail`) when the run is tainted and the address is no
 * direct one.
 */
export type LimitApprovalTarget = {
    channel?: string;
    address?: string;
    notification?: string;
};
