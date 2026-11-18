/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Run } from '@chamvi/store';
import type { IClock } from '../../clock/types.ts';
import type { ILockService } from '../../lock/types.ts';

/** What a notify delivery needs from the engine. */
export type NotifyContext = {
    clock: IClock;
    lockService: ILockService;
    /** The lock's TTL and the attempt's deadline. */
    claimTtlMs: number;
    onError: (error: unknown, run?: Run) => void;
};

/** One notification sent once per key (internal): approvals and remote approvals. */
export type NotifyDelivery = {
    /** The message key; the store lock is `notify:<key>`. */
    key: string;
    /** The run the notification is about (a failed lock release reaches onError with it). */
    run: Run;
    /** The caller's signal (drain); combined with the attempt's deadline. */
    signal: AbortSignal;
    /** The abort reason once the attempt passed claimTtlMs. */
    timeout: () => Error;
    /** Under the lock, before sending: whether the notification is still due (another attempt may have sent it). */
    pending: () => Promise<boolean>;
    /** Sends the message; raced against the attempt's signal, so a transport that ignores it does not hold the attempt. */
    send: (signal: AbortSignal) => Promise<void>;
    /** Records the sent notification; an InvalidRunStateError (moved on meanwhile) records nothing. */
    record: (signal: AbortSignal) => Promise<void>;
    /** Any other failure, with the attempt's signal (aborted by drain or the deadline). */
    fail: (error: unknown, signal: AbortSignal) => void;
};
