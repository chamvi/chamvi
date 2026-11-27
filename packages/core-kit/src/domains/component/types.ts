/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** One entry of `GET /components`; each time an ISO 8601 string, absent until it happened or when `status()` threw. */
export type ComponentView = {
    name: string;
    /** `job`: a background job of the app; `channel`: an engine channel with a `status()`. */
    kind: 'job' | 'channel';
    /** The last pass that completed without error ended. */
    lastSuccessAt?: string;
    /** The last pass that failed ended. */
    lastErrorAt?: string;
    /** The last pass ended, however it ended. */
    lastRunAt?: string;
    /** The pass in flight started. */
    runningSince?: string;
};
