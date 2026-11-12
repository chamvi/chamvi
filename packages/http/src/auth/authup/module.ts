/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { authorizationCatalogSchema, isAuthorizationCatalogStaleError } from '@authup/access';
import type { TokenVerificationData } from '@authup/server-adapter-kit';
import { verifyRequest } from '@authup/server-adapter-web';
import type { PermissionAuthorization, PermissionIdentity } from '@chamvi/access';
import { ErrorCode, InvalidAgentDefinitionError, systemClock } from '@chamvi/core';
import { ServiceUnavailableError, UnauthorizedError } from '@ebec/http';
import { isObject } from 'smob';
import type { Authenticator } from '../types.ts';
import { createCatalogCache } from './catalog.ts';
import { buildPrincipalSnapshot } from './snapshot.ts';
import type { AuthupOptions } from './types.ts';

const CATALOG_MAX_AGE_MS = 60_000;

function grantsGlobal(scope: unknown): boolean {
    return typeof scope === 'string' && scope.split(' ').includes('global');
}

const optionalString = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);

/** The identity an `identity` policy evaluates; none for a subject kind other than user or client. */
function readIdentity(data: TokenVerificationData, sub: string): PermissionIdentity | undefined {
    if (data.sub_kind !== 'user' && data.sub_kind !== 'client') {
        return undefined;
    }

    return {
        type: data.sub_kind,
        id: sub,
        realmId: optionalString(data.realm_id),
        realmName: optionalString(data.realm_name),
        clientId: optionalString(data.client_id),
    };
}

/**
 * Verifies authup access tokens. Grants are read only from tokens with the
 * `global` scope and a user or client subject; any other token keeps its
 * identity and grants nothing. The principal carries upstream's two-layer
 * snapshot of authup's catalog (`GET /authorization`) and the grants as its
 * `authorization`, with `realm()` as the realm every check reaches into; its
 * `bindings` stay empty. A catalog or realm that cannot be read grants
 * nothing and goes to `onError`. A verifier failing with a core
 * `TimeoutError` answers 503, any other failure 401. In local mode authup
 * yields no permissions: grants need remote mode.
 */
export function authup(options: AuthupOptions): Authenticator {
    const maxAgeMs = options.catalogMaxAgeMs ?? CATALOG_MAX_AGE_MS;

    if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) {
        throw new InvalidAgentDefinitionError('authup: catalogMaxAgeMs must be a positive finite number.');
    }

    // eslint-disable-next-line no-console
    const report = options.onError ?? ((error: unknown) => console.error('[chamvi]', error));
    const catalog = createCatalogCache(async () => {
        try {
            const document = await options.catalog();

            // a body that is not a catalog is a failed read, forgotten like a rejection
            const parsed = authorizationCatalogSchema.parse(document);
            const unreachable = parsed.permissions
                .filter((entry) => entry.realmId === null && entry.policies === null)
                .map((entry) => entry.name);

            // served, but every grant of these drops silently: say why, once per load
            if (unreachable.length > 0) {
                report(new InvalidAgentDefinitionError(
                    `authup: the catalog withholds the global definitions ${unreachable.join(', ')}; ` +
                    'grant the client\'s permission_read with a realm scope of ownOrNull or wider.',
                ));
            }

            // a fresh snapshot per load: a loader that updates and returns one object
            // must not meet the projection cached for that object's earlier content
            return parsed;
        } catch (error) {
            // once per failed fetch: concurrent callers share the rejected load
            report(error);

            throw error;
        }
    }, { clock: options.clock ?? systemClock, maxAgeMs });

    const resolve = async (data: TokenVerificationData, identity: PermissionIdentity | undefined): Promise<PermissionAuthorization | undefined> => {
        if (!identity || !grantsGlobal(data.scope) || !Array.isArray(data.permissions) || data.permissions.length === 0) {
            return undefined;
        }

        let realm: string;
        let document: unknown;

        try {
            realm = await options.realm();

            if (typeof realm !== 'string' || realm.length === 0) {
                throw new InvalidAgentDefinitionError('authup: realm() must resolve a non-empty realm id.');
            }
        } catch (error) {
            report(error);

            return undefined;
        }

        const build = async (): Promise<PermissionAuthorization> => ({
            snapshot: await buildPrincipalSnapshot({
                catalog: document, 
                grants: data.permissions, 
                realm, 
            }),
            realm,
        });

        try {
            document = await catalog.get();
        } catch {
            return undefined;
        }

        try {
            return await build();
        } catch (error) {
            if (!isAuthorizationCatalogStaleError(error)) {
                report(error);

                return undefined;
            }
        }

        try {
            document = await catalog.refresh(document);
        } catch {
            return undefined;
        }

        try {
            return await build();
        } catch (error) {
            report(error);

            return undefined;
        }
    };

    return async (request) => {
        let data;

        try {
            data = await verifyRequest(request, {
                tokenVerifier: options.verifier,
                certificateThumbprintByRequest: options.certificateThumbprintByRequest,
            });
        } catch (cause) {
            // authup did not answer in time: the token is not known to be invalid
            if (isObject(cause) && cause.code === ErrorCode.TIMEOUT) {
                throw new ServiceUnavailableError({ message: 'The access token could not be verified in time.', cause });
            }

            throw new UnauthorizedError({ message: 'The access token is invalid.', cause });
        }

        if (!data) {
            return undefined;
        }

        if (typeof data.sub !== 'string' || data.sub.length === 0) {
            throw new UnauthorizedError({ message: 'The access token names no subject.' });
        }

        const identity = readIdentity(data, data.sub);
        const authorization = await resolve(data, identity);

        return {
            id: data.sub,
            kind: 'authup',
            bindings: [],
            ...(authorization ? { authorization } : {}),
            ...(identity ? { identity } : {}),
            claims: { ...data },
        };
    };
}
