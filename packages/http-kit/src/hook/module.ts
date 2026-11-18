/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClient as IBaseClient, RequestOptions } from 'hapic';
import { FIXED_TOKEN } from '../domains/constants.ts';
import { HOOK_SYMBOL, RETRIED_SYMBOL } from './constants.ts';
import type { ClientAuthenticationHookOptions } from './types.ts';

type HookIds = { request: number; error: number };

type AttachedClient = IBaseClient & { [HOOK_SYMBOL]?: HookIds };

/**
 * Adds `Bearer <token()>` to every request of the clients it is attached
 * to, unless the call fixed its own token (`FIXED_TOKEN`). A 401 asks
 * `refresh()` once and retries; a 401 that stands (no refresh, a refused
 * or failed one, or a second 401) calls `onUnauthorized()` and rethrows.
 */
export class ClientAuthenticationHook {
    protected options: ClientAuthenticationHookOptions;

    constructor(options: ClientAuthenticationHookOptions) {
        this.options = options;
    }

    isAttached(client: IBaseClient): boolean {
        return (client as AttachedClient)[HOOK_SYMBOL] !== undefined;
    }

    attach(client: IBaseClient): void {
        if (this.isAttached(client)) {
            return;
        }

        const request = client.on('request', async (config) => {
            if (FIXED_TOKEN in config) {
                return config;
            }

            const headers = new Headers(config.headers);
            const token = await this.options.token();

            if (token) {
                headers.set('authorization', `Bearer ${token}`);
            } else {
                headers.delete('authorization');
            }

            return { ...config, headers };
        });

        const error = client.on('responseError', async (err) => {
            const config = err.request;

            if (err.response?.status !== 401 || FIXED_TOKEN in config) {
                throw err;
            }

            if (!(RETRIED_SYMBOL in config) && await this.refresh()) {
                return client.request({ ...config, [RETRIED_SYMBOL]: true } as RequestOptions);
            }

            this.options.onUnauthorized?.();

            throw err;
        });

        (client as AttachedClient)[HOOK_SYMBOL] = { request, error };
    }

    detach(client: IBaseClient): void {
        const ids = (client as AttachedClient)[HOOK_SYMBOL];

        if (!ids) {
            return;
        }

        client.off('request', ids.request);
        client.off('responseError', ids.error);
        delete (client as AttachedClient)[HOOK_SYMBOL];
    }

    protected async refresh(): Promise<boolean> {
        if (!this.options.refresh) {
            return false;
        }

        try {
            return await this.options.refresh();
        } catch {
            return false;
        }
    }
}
