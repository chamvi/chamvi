/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ILimitRepository } from '@chamvi/store';
import type { IClock } from '../clock/index.ts';
import type { StateSchema } from '../state/types.ts';
import type { ToolContext } from '../tool/types.ts';

/**
 * A rate limit of a tool: at most `max` counted calls (weights) per agent
 * in a sliding window of `windowMs`. A tool's own `limit` is a default the
 * agent's `limits` entry replaces whole.
 */
export type ToolLimit<I = any, S extends StateSchema = StateSchema> = {
    /** The most weight the calls in one window may count; a safe integer of at least 1. */
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
    /** How much of the limit a call takes, on its final input; a safe integer of at least 1, default 1. */
    weight?: (input: I, ctx: ToolContext<S>) => number | Promise<number>;
    /** The private body of the approval a call over the limit asks for. */
    detail?: (input: I, ctx: ToolContext<S>) => string | undefined | Promise<string | undefined>;
};

/** Per tool name, the limit replacing the tool's own one, or false to turn it off. */
export type AgentLimits = Record<string, ToolLimit | false>;

export type LimitServiceContext = {
    repository: ILimitRepository;
    /** Read for each use and each count: a use expires at exactly its record time + window. */
    clock: IClock;
};

/**
 * The operations of `LimitService`. Anything that satisfies it can stand in
 * for the service: the engine takes this type.
 */
export interface ILimitService {
    /** The summed weight of the unexpired uses of `scope`; one read. */
    used(scope: string): Promise<number>;

    /**
     * Counts a use of `scope` under `key` until now + `windowMs`, unless a use
     * of that `(scope, key)` is stored already (the call was counted).
     */
    record(scope: string, key: string, weight: number, windowMs: number): Promise<void>;

    /** Deletes the uses expired at `now` (default: the clock's time); resolves how many. */
    purgeExpired(now?: Date): Promise<number>;
}
