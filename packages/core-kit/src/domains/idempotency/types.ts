/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** A claimed idempotency key: the row an idempotency key stores. */
export type IdempotencyKey = {
    /** The row's storage id (a uuid); a takeover of the key keeps it. */
    id: string;
    /** Who the key belongs to, e.g. `<agent>:<channel>`. */
    scope: string;
    key: string;
    /** The run the key was claimed for; the run may not exist (yet). */
    runId: string;
    /** When the claim ends: from this time on it counts as expired. */
    expiresAt: Date;
};
