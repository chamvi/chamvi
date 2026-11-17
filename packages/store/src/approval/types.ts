/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** One choice of an approval request; `detail` is shown in the UI only (e.g. a diff). */
export type ApprovalOption = {
    id: string;
    label: string;
    detail?: string;
    /**
     * Ids of this run's artifacts to show with the option (e.g. from
     * `ctx.artifacts.put()`), at most APPROVAL_ARTIFACTS_PER_OPTION_MAX,
     * unique. Not part of channel messages.
     */
    artifacts?: string[];
};
