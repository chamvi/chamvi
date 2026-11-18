/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ApiError, Client } from '@chamvi/http-kit';
import type { IAccountAPI, IClient, MeWire } from '@chamvi/http-kit';
import type { IClient as IBaseClient } from 'hapic';
import { RoutedTransport } from './routed-transport.ts';
import type { RouteHandler } from './routed-transport.ts';

type Domains = Omit<IClient, keyof IBaseClient | 'timeoutMs'>;

/** Per domain, the methods a test fakes. */
export type FakeClientOverrides = { [K in keyof Domains]?: Partial<Domains[K]> };

/** A client whose every domain method throws `<domain>.<method> not faked` unless the test overrides it. */
export function fakeClient(overrides: FakeClientOverrides = {}): IClient {
    const domain = (name: string, methods: object = {}) => new Proxy(methods, {
        get(target, key) {
            if (key in target) {
                return (target as Record<PropertyKey, unknown>)[key];
            }

            return () => {
                throw new Error(`${name}.${String(key)} not faked`);
            };
        },
    });

    return new Proxy({ timeoutMs: 45_000 } as unknown as IClient, {
        get(target, key) {
            if (key in target) {
                return (target as unknown as Record<PropertyKey, unknown>)[key];
            }

            if (typeof key !== 'string' || key === 'then') {
                return undefined;
            }

            return domain(key, (overrides as Record<string, object | undefined>)[key]);
        },
    });
}

export const ME: MeWire = {
    id: 'admin',
    kind: 'token',
};

export function apiError(status: number, code = `http_${status}`): ApiError {
    return new ApiError(status, code, code);
}

/** `account.getMe()` accepting exactly these tokens. */
export function meFor(...tokens: string[]): IAccountAPI['getMe'] {
    return async (options) => {
        if (options?.token && tokens.includes(options.token)) {
            return ME;
        }

        throw apiError(401, 'unauthorized');
    };
}

/** A real `Client` over a `RoutedTransport`: `send` is the test's URL router. */
export function routedClient(send: RouteHandler): IClient {
    return new Client({ baseURL: '', transport: new RoutedTransport(send) });
}
