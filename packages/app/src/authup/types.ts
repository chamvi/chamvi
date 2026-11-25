/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ITokenVerifier } from '@authup/server-adapter-kit';
import type { Env } from '../env/types.ts';

/** Who owns the permissions chamvi checks on an authup login. */
export type AuthupPermissionOwner = 'realm' | 'client';

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
     * Who owns the permissions chamvi checks (#282). `realm` (default): the
     * global then the realm-owned definition. `client`: the dashboard client
     * (the dashboard module's authup sign-in, else
     * `AUTHUP_CLIENT_ID`, else `chamvi`) owns every name, checked
     * only as its definition in chamvi's realm; global and realm-owned
     * definitions grant nothing. A dashboard client given by
     * name is resolved once at start (needs `client_read`); one that does not
     * resolve to exactly one client fails the start. Default
     * `AUTHUP_PERMISSION_OWNER`; any other value is refused.
     */
    permissionOwner?: AuthupPermissionOwner;
    /**
     * How long each call to authup may take, in ms: the catalog read, the
     * realm lookup, the permission client lookup and each token verification
     * (a positive finite number).
     * A timed-out verification answers 503; a timed-out catalog or realm
     * grants the login nothing. Default `AUTHUP_TIMEOUT_MS`, else 10 000.
     */
    timeoutMs?: number;
    /** Default `AUTHUP_URL`. */
    url?: string;
    /**
     * The confidential client chamvi reads and verifies as, an id or a name.
     * Default `AUTHUP_SERVER_CLIENT_ID`, else `chamvi-server`.
     */
    clientId?: string;
    /** Default `AUTHUP_SERVER_CLIENT_SECRET` (required). */
    clientSecret?: string;
    /**
     * The realm (name or id) the client `clientId` lives in, sent as
     * `realm_id` with its client-credentials token request (authup finds a
     * client by name only within a realm). Default `AUTHUP_REALM`, else
     * `master` (the env value is the dashboard client.s realm too;
     * this option is not). Not chamvi's
     * resource realm: that is `realm`, else introspected from this client's
     * token.
     */
    clientRealm?: string;
    /**
     * Default `process.env`, read when the factory is called; `AUTHUP_URL`,
     * `AUTHUP_SERVER_CLIENT_ID`, `AUTHUP_REALM` and `AUTHUP_SERVER_CLIENT_SECRET` are read
     * unless `verifier`, `catalog` and `realm` are all given and no owner client
     * name is looked up, `AUTHUP_TIMEOUT_MS` unless `timeoutMs` is,
     * `AUTHUP_PERMISSION_OWNER` unless `permissionOwner` is.
     */
    env?: Env;
};
