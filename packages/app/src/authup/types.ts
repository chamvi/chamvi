/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ITokenVerifier } from '@authup/server-adapter-kit';
import type { Env } from '../env/types.ts';

export type AuthupModuleOptions = {
    /** Used as is. */
    verifier?: ITokenVerifier;
    /**
     * Reads authup's permission catalog (the `GET /authorization` body).
     * Default: read with a client-credentials token of the configured client
     * (needs `permission_read` with a realm scope of `ownOrNull` or wider).
     */
    catalog?: () => Promise<unknown>;
    /**
     * The realm id chamvi's resources belong to. Default: the realm of the
     * configured client, read once from the introspection of its own token.
     */
    realm?: string;
    /**
     * How long each call to authup may take, in ms: the catalog read, the
     * realm lookup and each token verification (a positive finite number).
     * A timed-out verification answers 503; a timed-out catalog or realm
     * grants the login nothing. Default `AUTHUP_TIMEOUT_MS`, else 10 000.
     */
    timeoutMs?: number;
    /** Default `AUTHUP_URL`. */
    url?: string;
    /** Default `AUTHUP_CLIENT_ID`. */
    clientId?: string;
    /** Default `AUTHUP_CLIENT_SECRET`. */
    clientSecret?: string;
    /**
     * Default `process.env`, read when the factory is called; `AUTHUP_URL`,
     * `AUTHUP_CLIENT_ID` and `AUTHUP_CLIENT_SECRET` are read unless
     * `verifier`, `catalog` and `realm` are all given, `AUTHUP_TIMEOUT_MS`
     * unless `timeoutMs` is.
     */
    env?: Env;
};
