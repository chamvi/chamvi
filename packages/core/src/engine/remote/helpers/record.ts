/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';
import { ValidationError } from '../../../errors/index.ts';
import { REMOTE_OUTCOME_STATUSES } from '../constants.ts';
import type { RemoteOutcome, RemoteStartRecord } from '../types.ts';

/** A stored `remote-start:` record (undefined for a malformed one). */
export function readRemoteStartRecord(value: unknown): RemoteStartRecord | undefined {
    if (
        !isObject(value) ||
        typeof value.runId !== 'string' ||
        value.runId.length === 0 ||
        typeof value.peer !== 'string'
    ) {
        return undefined;
    }

    return { runId: value.runId, peer: value.peer };
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
