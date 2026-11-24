/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export const AUTHUP_MODULE_NAME = 'chamvi:authup';

/** The confidential authup client chamvi's server reads and verifies as, unless `AUTHUP_CLIENT_ID` names another. */
export const AUTHUP_CLIENT_ID_DEFAULT = 'chamvi-server';

/** How long a call to authup (catalog, realm lookup, token verification) may take by default. */
export const AUTHUP_TIMEOUT_MS_DEFAULT = 10_000;

export const OIDC_MODULE_NAME = 'chamvi:oidc';
