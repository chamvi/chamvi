/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Client, createClientTokenCreator } from '@authup/core-http-kit';
import { TokenVerifier } from '@authup/server-adapter-kit';
import type { ITokenVerifier } from '@authup/server-adapter-kit';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { envString, envUrl } from '../env/module.ts';
import type { AuthupModuleOptions } from './types.ts';

/** Shares one load until it settles; a rejected load is forgotten, so the next call retries. */
function once<T>(load: () => Promise<T>): () => Promise<T> {
    let pending: Promise<T> | undefined;

    return () => {
        if (!pending) {
            const current = load();

            pending = current;
            current.catch(() => {
                if (pending === current) {
                    pending = undefined;
                }
            });
        }

        return pending;
    };
}

/**
 * The authup server of `AUTHUP_URL` (options win), reached as the client
 * `AUTHUP_CLIENT_ID`/`AUTHUP_CLIENT_SECRET`: the remote token verifier, the
 * permission catalog and the client's own realm. The catalog is read fresh
 * on every call (the authenticator caches it); the realm is introspected
 * once.
 */
export function createAuthupRemote(options: AuthupModuleOptions): {
    verifier: () => ITokenVerifier;
    catalog: () => Promise<unknown>;
    realm: () => Promise<string>;
} {
    const env = options.env ?? process.env;
    const url = options.url ?? envUrl(env, 'AUTHUP_URL', { required: true, protocols: ['http:', 'https:'] });
    const id = options.clientId ?? envString(env, 'AUTHUP_CLIENT_ID', { required: true });
    const secret = options.clientSecret ?? envString(env, 'AUTHUP_CLIENT_SECRET', { required: true });

    const creator = createClientTokenCreator({ id, secret }, { client: { baseURL: url } });
    const client = new Client({ baseURL: url });
    const authorizationHeader = async () => `Bearer ${(await creator()).access_token}`;

    return {
        verifier: () => new TokenVerifier({ baseURL: url, creator }),
        catalog: async () => client.authorization.get({ authorizationHeader: await authorizationHeader() }),
        realm: once(async () => {
            const header = await authorizationHeader();
            const data = await client.token.introspect(
                { token: header.slice('Bearer '.length) },
                { authorizationHeader: header },
            );

            if (typeof data.realm_id !== 'string' || data.realm_id.length === 0) {
                throw new InvalidAgentDefinitionError('authup: the introspection of the client\'s own token carries no realm_id.');
            }

            return data.realm_id;
        }),
    };
}
