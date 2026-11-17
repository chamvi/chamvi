/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DatabaseBusyHolder } from './types.ts';
import { DatabaseUnavailableError } from './unavailable.ts';

const ADVICE: Record<DatabaseBusyHolder, string> = {
    transaction: 'a transaction is still open on this data source after {ms} ms. ' +
        'Inside a transaction opened by hand on a query runner, use that runner or its manager, and end every transaction you open.',
    operation: 'an operation on this data source has not returned after {ms} ms. ' +
        'Work it waits for must run inside it (through its query runner, manager or callback), not beside it.',
};

/**
 * Work waited for a data source's one connection (better-sqlite3) the
 * whole deadline while one holder kept it: a transaction opened on a
 * query runner and not committed or rolled back, or an operation (a
 * callback, a migration) that does not return. The work was not
 * started; the message says what a caller can do.
 */
export class DatabaseBusyError extends DatabaseUnavailableError {
    /** How long the work waited behind the holder. */
    readonly waitedMs: number;

    /** Whether the holder had a transaction open or was an operation in flight. */
    readonly holder: DatabaseBusyHolder;

    constructor(waitedMs: number, holder: DatabaseBusyHolder = 'transaction') {
        super('wait');

        this.message = `The database could not complete the wait: ${ADVICE[holder].replace('{ms}', String(waitedMs))}`;
        this.waitedMs = waitedMs;
        this.holder = holder;
    }
}
