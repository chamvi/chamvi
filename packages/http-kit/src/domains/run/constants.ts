/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { defineSchema } from '@rapiq/core';
import type { RunListFields } from './types.ts';

/** The run list query a caller may hold: agent, status and createdAt filters, the creation order, a page of at most 100. */
export const RUN_LIST_QUERY_SCHEMA = defineSchema<RunListFields>({
    filters: { allowed: ['agent', 'createdAt', 'status'] },
    sorts: { allowed: ['createdAt'] },
    pagination: { maxLimit: 100 },
});
