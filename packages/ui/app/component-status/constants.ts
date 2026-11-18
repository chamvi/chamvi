/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** Refresh so the pass times and the running state stay current. */
export const COMPONENTS_POLL_MS = 15_000;

/** The time columns of the components table, in order. */
export const COMPONENT_TIME_COLUMNS = [
    { key: 'lastSuccessAt', label: 'Last success' },
    { key: 'lastErrorAt', label: 'Last error' },
    { key: 'lastRunAt', label: 'Last run' },
    { key: 'runningSince', label: 'Running since' },
] as const;
