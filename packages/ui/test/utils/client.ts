/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ApiError } from '@chamvi/http-kit';
import type { IAccountAPI, IClient, MeWire } from '@chamvi/http-kit';
import type { IClient as IBaseClient } from 'hapic';
import { ALL } from './permissions.ts';

type Domains = Omit<IClient, keyof IBaseClient | 'timeoutMs'>;

/** Per domain, the methods a test fakes. */
export type FakeClientOverrides = { [K in keyof Domains]?: Partial<Domains[K]> };

/**
 * A client whose every domain method throws `<domain>.<method> not faked`
 * unless a layer overrides it (later layers win per method); `authorization.check` answers every name
 * (the check of a `'*'` token).
 */
export function fakeClient(...layers: FakeClientOverrides[]): IClient {
    const defaults: FakeClientOverrides = { authorization: { check: async () => ({ permissions: ALL }) } };
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

            const record = (from: FakeClientOverrides) => (from as Record<string, object | undefined>)[key];

            return domain(key, Object.assign({}, ...[defaults, ...layers].map(record)));
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
