/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { Permission } from '@chamvi/access';

export const AUTHUP_REALM = 'c641912c-21e5-4cb4-84b6-169e2b2bb023';
export const AUTHUP_USER = '245e3c5d-5747-4fbd-8554-c33d34780c58';
export const AUTHUP_CLIENT = '6a3c1a4c-3d0e-4c8e-9a51-0e1f4b8a9d77';
export const CLIENT_TOKEN = 'client-access-token';

const definition = (name: string) => ({
    name,
    realmId: null,
    clientId: null,
    decisionStrategy: null,
    policies: ['default'],
});

/** authup's `GET /authorization` body: the eleven names behind `system.default`, plus one attributes policy. */
export const CATALOG = {
    policies: {
        default: {
            type: 'composite',
            decisionStrategy: 'unanimous',
            children: [{ type: 'identity' }, { type: 'permissionBinding' }],
        },
        bot: { type: 'attributes', query: { name: 'bot' } },
    },
    permissions: Object.values(Permission).map(definition),
};

/** A role granting `chamvi_connection_write` restricted to the connection `bot`. */
export const BOT_WRITER_GRANTS = [{
    name: Permission.CONNECTION_WRITE,
    realm_scope: 'own',
    policies: ['bot'],
}];

/** The introspection of a global user token with these grants. */
export function userTokenData(grants: unknown[] = BOT_WRITER_GRANTS): Record<string, unknown> {
    return {
        sub: AUTHUP_USER,
        sub_kind: 'user',
        realm_id: AUTHUP_REALM,
        realm_name: 'master',
        scope: 'global',
        permissions: grants,
    };
}

export type FakeAuthup = {
    url: string;
    /** Requests by method and path, in order. */
    requests: string[];
    close(): Promise<void>;
};

function readBody(request: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        let body = '';

        request.setEncoding('utf8');
        request.on('data', (chunk: string) => {
            body += chunk;
        });
        request.on('end', () => resolve(body));
        request.on('error', reject);
    });
}

/**
 * A loopback authup: `POST /token` mints `CLIENT_TOKEN` for client
 * credentials, `POST /token/introspect` answers for that token (a client of
 * `AUTHUP_REALM`) and for every key of `users`, `GET /authorization` serves
 * `catalog` to the client token (or 403 when `catalog` is undefined).
 */
export async function createFakeAuthup(options: {
    users: Record<string, Record<string, unknown>>;
    catalog?: unknown;
}): Promise<FakeAuthup> {
    const requests: string[] = [];
    const exp = Math.floor(Date.now() / 1000) + 3600;

    const server = createServer((request, response) => {
        const path = (request.url ?? '').split('?')[0];

        requests.push(`${request.method} ${path}`);

        const json = (status: number, body: unknown) => {
            response.writeHead(status, { 'content-type': 'application/json' });
            response.end(JSON.stringify(body));
        };

        readBody(request).then((body) => {
            if (request.method === 'POST' && path === '/token') {
                json(200, {
                    access_token: CLIENT_TOKEN,
                    token_type: 'Bearer',
                    expires_in: 3600,
                });

                return;
            }

            if (request.method === 'POST' && path === '/token/introspect') {
                const token = new URLSearchParams(body).get('token') ?? '';

                if (request.headers.authorization !== `Bearer ${CLIENT_TOKEN}`) {
                    json(401, { message: 'unauthorized' });

                    return;
                }

                if (token === CLIENT_TOKEN) {
                    json(200, {
                        active: true,
                        sub: AUTHUP_CLIENT,
                        sub_kind: 'client',
                        realm_id: AUTHUP_REALM,
                        realm_name: 'master',
                        client_id: AUTHUP_CLIENT,
                        scope: 'global',
                        exp,
                    });

                    return;
                }

                const user = options.users[token];

                json(200, user ? {
                    active: true,
                    exp,
                    ...user,
                } : { active: false });

                return;
            }

            if (request.method === 'GET' && path === '/authorization') {
                if (request.headers.authorization !== `Bearer ${CLIENT_TOKEN}` || typeof options.catalog === 'undefined') {
                    json(403, { message: 'permission_read is required.' });

                    return;
                }

                json(200, options.catalog);

                return;
            }

            json(404, { message: 'not found' });
        }).catch(() => {
            json(500, { message: 'error' });
        });
    });

    await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve());
    });

    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    return {
        url: `http://127.0.0.1:${port}`,
        requests,
        close: () => new Promise((resolve) => {
            server.closeAllConnections();
            server.close(() => resolve());
        }),
    };
}
