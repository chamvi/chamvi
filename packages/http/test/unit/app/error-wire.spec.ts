/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    BadRequestError,
    ChamviError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
    RequestEntityTooLargeError,
    ServiceUnavailableError,
    TooManyRequestsError,
    UnauthorizedError,
    UnsupportedMediaTypeError,
} from '@chamvi/errors';
import { NotFoundError as AppNotFoundError } from '@ebec/http';
import { DController, DGet } from '@routup/decorators';
import { App, defineCoreHandler } from 'routup';
import type { IAppEvent } from 'routup';
import { describe, expect, it } from 'vitest';
import { PeerStartBusyError, RunNotFoundError } from '@chamvi/core';
import { ADMIN_TOKEN, call, createTestApp } from '../../utils/app.ts';

type WireCase = {
    title: string;
    error: () => unknown;
    /** Runs in the route before the throw (a header a plugin sets). */
    prepare?: (event: IAppEvent) => void;
    headers?: Record<string, string>;
    status: number;
    body: Record<string, unknown>;
    wwwAuthenticate?: string | null;
    retryAfter?: string | null;
    reported: boolean;
};

const CASES: WireCase[] = [
    {
        title: 'BadRequestError',
        error: () => new BadRequestError({ message: 'The request body is not valid JSON.' }),
        status: 400,
        body: {
            status: 400,
            code: 'bad_request',
            message: 'The request body is not valid JSON.',
        },
        reported: false,
    },
    {
        title: 'BadRequestError with issues',
        error: () => new BadRequestError({
            message: 'Invalid payload: input: required',
            issues: [{
                type: 'item',
                code: 'required',
                path: ['input'],
                message: 'required',
            }],
        }),
        status: 400,
        body: {
            status: 400,
            code: 'bad_request',
            message: 'Invalid payload: input: required',
            issues: [{
                type: 'item',
                code: 'required',
                path: ['input'],
                message: 'required',
            }],
        },
        reported: false,
    },
    {
        title: 'UnauthorizedError without a bearer header',
        error: () => new UnauthorizedError({ message: 'Authentication required.' }),
        status: 401,
        body: {
            status: 401,
            code: 'unauthorized',
            message: 'Authentication required.',
        },
        wwwAuthenticate: 'Bearer',
        reported: false,
    },
    {
        title: 'UnauthorizedError with a bearer header',
        error: () => new UnauthorizedError({ message: 'The access token is invalid.' }),
        headers: { authorization: 'Bearer some-token' },
        status: 401,
        body: {
            status: 401,
            code: 'unauthorized',
            message: 'The access token is invalid.',
        },
        wwwAuthenticate: 'Bearer',
        reported: false,
    },
    {
        title: 'UnauthorizedError with a code of its own (an oidc verification failure)',
        error: () => new UnauthorizedError({ message: 'The access token is invalid.', code: 'token_expired' }),
        headers: { authorization: 'Bearer some-token' },
        status: 401,
        body: {
            status: 401,
            code: 'token_expired',
            message: 'The access token is invalid.',
        },
        wwwAuthenticate: 'Bearer',
        reported: false,
    },
    {
        title: 'ForbiddenError',
        error: () => new ForbiddenError({ message: 'Missing permission "chamvi_run_read".' }),
        status: 403,
        body: {
            status: 403,
            code: 'forbidden',
            message: 'Missing permission "chamvi_run_read".',
        },
        wwwAuthenticate: null,
        reported: false,
    },
    {
        title: 'NotFoundError',
        error: () => new NotFoundError({ message: 'The connection "mail" does not exist.' }),
        status: 404,
        body: {
            status: 404,
            code: 'not_found',
            message: 'The connection "mail" does not exist.',
        },
        reported: false,
    },
    {
        title: 'ConflictError',
        error: () => new ConflictError({ message: 'The connection "mail" already exists.' }),
        status: 409,
        body: {
            status: 409,
            code: 'conflict',
            message: 'The connection "mail" already exists.',
        },
        reported: false,
    },
    {
        title: 'RequestEntityTooLargeError',
        error: () => new RequestEntityTooLargeError({ message: 'The request body exceeds 10 bytes.' }),
        status: 413,
        body: {
            status: 413,
            code: 'request_entity_too_large',
            message: 'The request body exceeds 10 bytes.',
        },
        reported: false,
    },
    {
        title: 'UnsupportedMediaTypeError',
        error: () => new UnsupportedMediaTypeError({ message: 'The request body must be application/json.' }),
        status: 415,
        body: {
            status: 415,
            code: 'unsupported_media_type',
            message: 'The request body must be application/json.',
        },
        reported: false,
    },
    {
        title: 'TooManyRequestsError with the Retry-After of the rate limit',
        error: () => new TooManyRequestsError({ message: 'Too many requests, please try again later.' }),
        prepare: (event) => {
            event.response.headers.set('retry-after', '60');
        },
        status: 429,
        body: {
            status: 429,
            code: 'too_many_requests',
            message: 'Too many requests, please try again later.',
        },
        retryAfter: '60',
        reported: false,
    },
    {
        title: 'ServiceUnavailableError',
        error: () => new ServiceUnavailableError({ message: 'The token issuer is unreachable.' }),
        status: 503,
        body: {
            status: 503,
            code: 'service_unavailable',
            message: 'Internal Server Error',
        },
        retryAfter: null,
        reported: true,
    },
    {
        title: 'a core RunNotFoundError',
        error: () => new RunNotFoundError('r1'),
        status: 404,
        body: {
            status: 404,
            code: 'run_not_found',
            message: 'Run "r1" was not found.',
        },
        reported: false,
    },
    {
        title: 'PeerStartBusyError',
        error: () => new PeerStartBusyError('peer-a', 'r1'),
        status: 503,
        body: {
            status: 503,
            code: 'peer_start_busy',
            message: 'Another start of run r1 of peer "peer-a" is being counted; resend it.',
        },
        retryAfter: '1',
        reported: false,
    },
    {
        title: 'a ChamviError with an unmapped code',
        error: () => new ChamviError({ code: 'unmapped', message: 'secret detail' }),
        status: 500,
        body: {
            status: 500,
            code: 'internal_error',
            message: 'Internal Server Error',
        },
        reported: true,
    },
];

function appThrowing(entry: WireCase, onError: (error: unknown) => void) {
    // the app ends in a catch-all, so the throwing route goes in front of it
    const { app } = createTestApp({ onError });
    const outer = new App();

    outer.get('/boom', defineCoreHandler((event) => {
        entry.prepare?.(event);

        throw entry.error();
    }));
    outer.use(app);

    return outer;
}

@DController('/wire')
class ThrowingController {
    @DGet('')
    async get(): Promise<Record<string, unknown>> {
        throw new AppNotFoundError({ message: 'The note does not exist.' });
    }
}

describe('error wire format', () => {
    it.each(CASES)('renders $title', async (entry) => {
        const reported: unknown[] = [];
        const response = await call(appThrowing(entry, (error) => {
            reported.push(error);
        }), 'GET', '/boom', { headers: entry.headers });

        expect(response.status).toBe(entry.status);
        expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
        expect(await response.text()).toBe(JSON.stringify(entry.body));

        if (entry.wwwAuthenticate !== undefined) {
            expect(response.headers.get('www-authenticate')).toBe(entry.wwwAuthenticate);
        }

        if (entry.retryAfter !== undefined) {
            expect(response.headers.get('retry-after')).toBe(entry.retryAfter);
        }

        expect(reported).toHaveLength(entry.reported ? 1 : 0);
    });

    it('renders an @ebec/http error thrown by an app controller unchanged', async () => {
        const reported: unknown[] = [];
        const { app } = createTestApp({
            controllers: [new ThrowingController()],
            onError: (error) => {
                reported.push(error);
            },
        });
        const response = await call(app, 'GET', '/wire', { token: ADMIN_TOKEN });

        expect(response.status).toBe(404);
        expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
        expect(await response.text()).toBe(JSON.stringify({
            status: 404,
            code: 'not_found',
            message: 'The note does not exist.',
        }));
        expect(reported).toHaveLength(0);
    });
});
