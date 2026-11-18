/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';
import { RunStatus } from '@chamvi/store';
import type { RemoteWaitPoint, Run } from '@chamvi/store';
import type { RemoteOutcome, RemoteStartRecord } from './types.ts';

/** The effect key of a stand-in's start: its record holds the remote run id. */
export function remoteStartKey(runId: string): string {
    return `remote-start:${runId}`;
}

/** The effect key of a stand-in's recorded remote outcome. */
export function remoteWaitKey(runId: string): string {
    return `remote-wait:${runId}`;
}

/** A `waiting` run's remote wait point (undefined for any other run). */
export function remoteWaitOf(run: Run | undefined): RemoteWaitPoint | undefined {
    return run?.status === RunStatus.WAITING && run.waiting?.kind === 'remote' ? run.waiting : undefined;
}

/** A stored `remote-start:` record (undefined for a malformed one). */
export function readStartRecord(value: unknown): RemoteStartRecord | undefined {
    if (!isObject(value) || typeof value.runId !== 'string' || value.runId.length === 0) {
        return undefined;
    }

    return { runId: value.runId };
}

/** A stored `remote-wait:` record (undefined for a malformed one). */
export function readOutcome(value: unknown): RemoteOutcome | undefined {
    if (!isObject(value) || typeof value.status !== 'string' || !isObject(value.usage)) {
        return undefined;
    }

    return value as RemoteOutcome;
}
