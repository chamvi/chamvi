/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { envString, envUrl } from '../../env/module.ts';
import type { Env } from '../../env/types.ts';
import type { UiAuth } from '../types.ts';

/**
 * The dashboard's sign-in from the env: the token login, plus the authup login
 * with `CHAMVI_UI_AUTHUP_CLIENT_ID` (then `AUTHUP_URL` is required) and the
 * optional `CHAMVI_UI_AUTHUP_REALM_ID`.
 */
export function readUiAuth(env: Env): UiAuth {
    const clientId = envString(env, 'CHAMVI_UI_AUTHUP_CLIENT_ID');

    if (typeof clientId === 'undefined') {
        return { tokens: true };
    }

    const realmId = envString(env, 'CHAMVI_UI_AUTHUP_REALM_ID');

    return {
        tokens: true,
        authup: {
            url: envUrl(env, 'AUTHUP_URL', { required: true, protocols: ['http:', 'https:'] }),
            clientId,
            ...(typeof realmId === 'string' && { realmId }),
        },
    };
}
