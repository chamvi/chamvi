/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { authorizationCatalogSchema, isAuthorizationCatalogStaleError } from '@authup/access';
import type { TokenVerificationData } from '@authup/server-adapter-kit';
import { verifyRequest } from '@authup/server-adapter-web';
import type { PermissionBinding, PermissionIdentity } from '@chamvi/access';
import { InvalidAgentDefinitionError, systemClock } from '@chamvi/core';
import { UnauthorizedError } from '@ebec/http';
import type { Authenticator } from '../types.ts';
import { createCatalogCache } from './catalog.ts';
import { flattenGrants } from './flatten.ts';
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
 * identity and grants nothing. Each grant becomes a binding with its policy
 * trees resolved from authup's catalog (`GET /authorization`) and its realm
 * reach settled against `realm()`. A grant that cannot be expressed is
 * dropped; a catalog or realm that cannot be read grants nothing and goes to
 * `onError`. In local mode authup yields no permissions: grants need remote
 * mode.
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

    const resolve = async (data: TokenVerificationData, identity: PermissionIdentity | undefined): Promise<PermissionBinding[]> => {
        if (!identity || !grantsGlobal(data.scope) || !Array.isArray(data.permissions) || data.permissions.length === 0) {
            return [];
        }

        let realm: string;
        let document: unknown;

        try {
            realm = await options.realm();
        } catch (error) {
            report(error);

            return [];
        }

        const flatten = () => flattenGrants({
            catalog: document,
            grants: data.permissions,
            identity,
            realm,
        });

        try {
            document = await catalog.get();
        } catch {
            return [];
        }

        try {
            return await flatten();
        } catch (error) {
            if (!isAuthorizationCatalogStaleError(error)) {
                report(error);

                return [];
            }
        }

        try {
            document = await catalog.refresh(document);
        } catch {
            return [];
        }

        try {
            return await flatten();
        } catch (error) {
            report(error);

            return [];
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
            throw new UnauthorizedError({ message: 'The access token is invalid.', cause });
        }

        if (!data) {
            return undefined;
        }

        if (typeof data.sub !== 'string' || data.sub.length === 0) {
            throw new UnauthorizedError({ message: 'The access token names no subject.' });
        }

        const identity = readIdentity(data, data.sub);

        return {
            id: data.sub,
            kind: 'authup',
            permissions: await resolve(data, identity),
            ...(identity ? { identity } : {}),
            claims: { ...data },
        };
    };
}
