import type { IEngine } from '@chamvi/core';
import { authup, createHttpApp, staticTokens } from '@chamvi/http';
import type { AuthupOptions } from '@chamvi/http';
import { uiRoutes } from '@chamvi/ui';

export function tokenDashboard(engine: IEngine) {
    // #region tokens
    return createHttpApp({
        engine,
        auth: [staticTokens({
            tokens: [{
                value: process.env.ADMIN_TOKEN!,
                id: 'admin',
                permissions: '*',
            }],
        })],
        // the dashboard at /ui, signed in with a pasted bearer token
        routes: uiRoutes(),
    });
    // #endregion tokens
}

/** `verifier`, `catalog` and `realm`: see the HTTP guide (`@chamvi/app/authup` wires all three from env). */
export function authupDashboard(engine: IEngine, options: AuthupOptions) {
    // #region authup
    return createHttpApp({
        engine,
        basePath: '/api',
        auth: [authup(options)],
        routes: uiRoutes({
            // served at /api/console/, the API under /api
            basePath: '/console',
            auth: {
                tokens: false,
                // the authup client needs <origin>/api/console/login/callback as a redirect URI
                authup: { url: 'https://auth.example.com/api', clientId: 'chamvi' },
            },
        }),
    });
    // #endregion authup
}
