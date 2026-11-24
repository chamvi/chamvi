/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { envString, envUrl } from '../../env/module.ts';
import type { Env } from '../../env/types.ts';
import { AUTHUP_REALM_DEFAULT, UI_AUTHUP_CLIENT_ID_DEFAULT } from '../constants.ts';
import type { UiAuth } from '../types.ts';

/** The authup realm (name or id) the server and dashboard clients live in: `AUTHUP_REALM`, else `master`. */
export function readAuthupRealm(env: Env): string {
    return envString(env, 'AUTHUP_REALM') ?? AUTHUP_REALM_DEFAULT;
}

/** The dashboard client, an id or a name: `CHAMVI_UI_AUTHUP_CLIENT_ID`, else `chamvi`. */
export function readUiAuthupClient(env: Env): string {
    return envString(env, 'CHAMVI_UI_AUTHUP_CLIENT_ID') ?? UI_AUTHUP_CLIENT_ID_DEFAULT;
}

/**
 * The dashboard's sign-in from the env: the token login, plus the authup
 * login whenever `AUTHUP_URL` is set, as the client
 * `CHAMVI_UI_AUTHUP_CLIENT_ID` (default `chamvi`) of the realm
 * `CHAMVI_UI_AUTHUP_REALM_ID` (default `AUTHUP_REALM`, else `master`).
 * `CHAMVI_UI_AUTHUP_CLIENT_ID` without `AUTHUP_URL` is refused.
 */
export function readUiAuth(env: Env): UiAuth {
    const named = typeof envString(env, 'CHAMVI_UI_AUTHUP_CLIENT_ID') === 'string';
    const url = envUrl(env, 'AUTHUP_URL', { required: named, protocols: ['http:', 'https:'] });

    if (typeof url === 'undefined') {
        return { tokens: true };
    }

    return {
        tokens: true,
        authup: {
            url,
            clientId: readUiAuthupClient(env),
            realmId: envString(env, 'CHAMVI_UI_AUTHUP_REALM_ID') ?? readAuthupRealm(env),
        },
    };
}
