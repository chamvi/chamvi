/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export const ErrorCode = {
    AGENT_NOT_FOUND: 'agent_not_found',
    AGENT_REMOVED: 'agent_removed',
    AGENT_REPLACED: 'agent_replaced',
    ARTIFACT_NOT_FOUND: 'artifact_not_found',
    BAD_REQUEST: 'bad_request',
    BUDGET_EXCEEDED: 'BudgetExceeded',
    CHANNEL_NOT_FOUND: 'channel_not_found',
    CONFLICT: 'conflict',
    CONNECTION_CHANGED: 'connection_changed',
    CONNECTION_HELD: 'connection_held',
    CONNECTION_NOT_CONFIGURED: 'connection_not_configured',
    CONTEXT_NOT_PROVIDED: 'context_not_provided',
    DECRYPTION_FAILED: 'decryption_failed',
    ENTITY_CONFLICT: 'entity_conflict',
    ENTITY_DEADLOCK: 'entity_deadlock',
    ENTITY_INVALID: 'entity_invalid',
    ENTITY_NOT_FOUND: 'entity_not_found',
    ENTITY_QUERY_INVALID: 'entity_query_invalid',
    ENTITY_RELATION_INVALID: 'entity_relation_invalid',
    FATAL_TOOL: 'FatalToolError',
    FORBIDDEN: 'forbidden',
    INCOMPLETE_RESPONSE: 'incomplete_response',
    INTERNAL_ERROR: 'internal_error',
    INVALID_AGENT_DEFINITION: 'invalid_agent_definition',
    INVALID_RUN_STATE: 'invalid_run_state',
    LEASE_LOST: 'lease_lost',
    NOT_FOUND: 'not_found',
    PEER_START_BUSY: 'peer_start_busy',
    REMOTE_FAILED: 'remote_failed',
    REPOSITORY_NOT_FOUND: 'repository_not_found',
    REQUEST_ENTITY_TOO_LARGE: 'request_entity_too_large',
    RUN_NOT_FOUND: 'run_not_found',
    SANDBOX: 'sandbox_error',
    SERVICE_UNAVAILABLE: 'service_unavailable',
    TIMEOUT: 'Timeout',
    TOO_MANY_REQUESTS: 'too_many_requests',
    TOOL_DENIED: 'tool_denied',
    TOOL_NOT_ALLOWED: 'tool_not_allowed',
    UNAUTHORIZED: 'unauthorized',
    UNSUPPORTED_MEDIA_TYPE: 'unsupported_media_type',
    VALIDATION: 'validation_error',
} as const;

// eslint-disable-next-line @tada5hi/type-declaration-location -- Keep the enum-like value and its same-name type contract together.
export type ErrorCode = typeof ErrorCode[keyof typeof ErrorCode];
