/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export const StoreErrorCode = {
    ENTITY_CONFLICT: 'entity_conflict',
    ENTITY_DEADLOCK: 'entity_deadlock',
    ENTITY_INVALID: 'entity_invalid',
    ENTITY_NOT_FOUND: 'entity_not_found',
    ENTITY_QUERY_INVALID: 'entity_query_invalid',
    ENTITY_RELATION_INVALID: 'entity_relation_invalid',
} as const;
