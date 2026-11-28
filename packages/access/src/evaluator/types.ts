/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export type HolderPermissionEvaluatorOptions = {
    /** Feeds the date and time policies. Absent: the real clock. */
    now?: () => Date;
};
