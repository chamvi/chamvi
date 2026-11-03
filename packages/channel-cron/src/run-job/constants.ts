/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { RunStatusLiteral } from '@chamvi/core';

/** Statuses a job always returns on: the run finished. */
export const TERMINAL: RunStatusLiteral[] = ['completed', 'failed', 'cancelled'];

/** Statuses of a dispatched run that may still reach an approval wait. */
export const UNSETTLED: RunStatusLiteral[] = ['queued', 'running', 'waiting', 'interrupted'];
