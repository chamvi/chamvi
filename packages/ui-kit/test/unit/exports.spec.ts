/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import * as kit from '@chamvi/ui-kit';
import * as vite from '@chamvi/ui-kit/vite';

describe('public api', () => {
    it('exports the kit', () => {
        expect(Object.keys(kit).sort()).toEqual([
            'APP_CONTEXT',
            'AUTHUP_STORAGE_PREFIX',
            'AccountsColumn',
            'AppShell',
            'BrandLogo',
            'CONFIG_ELEMENT_ID',
            'CONNECTIONS_POLL_MS',
            'ConnectionForm',
            'ConnectionPanel',
            'ConnectionsPage',
            'DEV_CONFIG',
            'LOGIN_ROUTE_NAME',
            'NavIcon',
            'RETURN_STORAGE_KEY',
            'STATUS_BADGES',
            'STORAGE_PREFIX',
            'StatusBadge',
            'StatusChip',
            'TOKEN_STORAGE_KEY',
            'VERDICT_REFRESH_MS',
            'clearStorage',
            'connectionBadge',
            'connectionProblem',
            'createAuthGuard',
            'createPoller',
            'createSession',
            'createSessionCookies',
            'default',
            'documentVisibility',
            'install',
            'installComponents',
            'installVuecs',
            'isPagePath',
            'mountPage',
            'readConfig',
            'safeReturnPath',
            'statusBadge',
            'useAppContext',
            'useConnection',
            'useConnections',
            'useUiPages',
        ]);
    });

    it('@chamvi/ui-kit/vite exports definePageConfig', () => {
        expect(Object.keys(vite).sort()).toEqual([
            'definePageConfig',
        ]);
    });

    it.each([
        'definePageConfig',
    ])('the main entry keeps %s out', (name) => {
        expect(Object.keys(kit)).not.toContain(name);
    });
});
