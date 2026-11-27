/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/errors';
import { isObject } from 'smob';
import { REMOTE_OUTCOME_STATUSES } from '../constants.ts';
import type { RemoteOutcome, RemoteStartAttempt, RemoteStartRecord } from '../types.ts';

/** A stored `remote-start:` record (undefined for a malformed one). */
export function readRemoteStartRecord(value: unknown): RemoteStartRecord | undefined {
    if (!isObject(value) || typeof value.runId !== 'string' || value.runId.length === 0) {
        return undefined;
    }

    return {
        runId: value.runId,
        ...(typeof value.peer === 'string' ? { peer: value.peer } : {}),
    };
}

/** The start attempt `remote-start:<runId>` holds while no answer is recorded; undefined for anything else. */
export function readRemoteStartAttempt(value: unknown): RemoteStartAttempt | undefined {
    const attempt = isObject(value) ? value.attempt : undefined;

    if (
        !isObject(attempt) ||
        typeof attempt.peer !== 'string' ||
        typeof attempt.agent !== 'string' ||
        typeof attempt.role !== 'string' ||
        typeof attempt.at !== 'number'
    ) {
        return undefined;
    }

    return {
        peer: attempt.peer,
        agent: attempt.agent,
        role: attempt.role,
        at: attempt.at,
    };
}

/**
 * A stored `remote-wait:` record: undefined when nothing is recorded, a
 * ValidationError for a record that is not an outcome (it never settles a run).
 */
export function readRemoteOutcome(value: unknown): RemoteOutcome | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (
        !isObject(value) ||
        typeof value.status !== 'string' ||
        !REMOTE_OUTCOME_STATUSES.includes(value.status) ||
        typeof value.tainted !== 'boolean' ||
        !isObject(value.usage)
    ) {
        throw new ValidationError('The recorded remote outcome is malformed.');
    }

    return value as RemoteOutcome;
}
