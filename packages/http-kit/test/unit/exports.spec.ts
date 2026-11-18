/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import * as kit from '@chamvi/http-kit';

describe('public api', () => {
    it('exports the client, the domain APIs, the hook, the errors and the helpers', () => {
        expect(Object.keys(kit).sort()).toEqual([
            'AccountAPI',
            'AgentAPI',
            'ApiError',
            'ArtifactAPI',
            'AuthorizationAPI',
            'BaseAPI',
            'Client',
            'ClientAuthenticationHook',
            'ComponentAPI',
            'ConnectionAPI',
            'ConnectionTypeAPI',
            'FATAL_STREAM_STATUSES',
            'FIXED_TOKEN',
            'RATE_LIMIT_BACKOFF_MS',
            'RECONNECT_DELAYS_MS',
            'REQUEST_TIMEOUT_MS',
            'RUN_LIST_QUERY_SCHEMA',
            'RunAPI',
            'ScheduleAPI',
            'StateAPI',
            'UiPageAPI',
            'asApiError',
            'buildQueryString',
            'buildRequestConfig',
            'createClient',
            'decodeRunListQuery',
            'openConnectionStream',
            'parseEventStream',
            'path',
            'retryDelayOf',
            'sleep',
            'toApiError',
        ]);
    });
});
