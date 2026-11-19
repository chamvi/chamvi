/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** The statuses a recorded remote outcome may carry. */
export const REMOTE_OUTCOME_STATUSES: readonly string[] = ['completed', 'failed', 'cancelled', 'timeout'];

/** The usage of a remote run that reported none (a timeout). */
export const REMOTE_NO_USAGE = { inputTokens: 0, outputTokens: 0 } as const;
