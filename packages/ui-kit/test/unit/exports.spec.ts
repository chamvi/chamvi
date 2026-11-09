/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import * as kit from '@chamvi/ui-kit';

describe('public api', () => {
    it('exports the kit', () => {
        expect(Object.keys(kit).sort()).toEqual([
            'APP_CONTEXT',
            'AUTHUP_STORAGE_PREFIX',
            'ApiError',
            'CONFIG_ELEMENT_ID',
            'DEV_CONFIG',
            'FATAL_STREAM_STATUSES',
            'LOGIN_ROUTE_NAME',
            'RATE_LIMIT_BACKOFF_MS',
            'RECONNECT_DELAYS_MS',
            'RETURN_STORAGE_KEY',
            'STORAGE_PREFIX',
            'TOKEN_STORAGE_KEY',
            'asApiError',
            'clearStorage',
            'createApiClient',
            'createAuthGuard',
            'createPoller',
            'createSession',
            'createSessionCookies',
            'documentVisibility',
            'hasPermission',
            'pageQuery',
            'parseEventStream',
            'path',
            'readConfig',
            'retryDelayOf',
            'runListQuery',
            'safeReturnPath',
            'sleep',
            'toApiError',
            'useAppContext',
            'withQuery',
        ]);
    });
});
