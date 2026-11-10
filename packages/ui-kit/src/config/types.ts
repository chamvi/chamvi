/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export type UiAuthupConfig = {
    /** The authup API URL, e.g. `https://auth.example.com/api`. */
    url: string;
    /** The authup client the dashboard signs in as (code flow with PKCE). */
    clientId: string;
    realmId?: string;
};

/** What the server injects into a page's `index.html`. */
export type UiConfig = {
    /** The chamvi API base (the app's `basePath`, `''` by default). */
    apiBase: string;
    /** Where the dashboard is mounted, e.g. `/ui`. */
    uiBase: string;
    auth: {
        /** Offer the token-paste sign-in (static bearer tokens). */
        tokens: boolean;
        authup?: UiAuthupConfig;
    };
};
