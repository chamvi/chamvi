/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { shallowRef } from 'vue';
import { ApiError } from '../api/error.ts';
import type { MeWire } from '../api/types.ts';
import type { UiConfig } from '../config/types.ts';
import { RETURN_STORAGE_KEY, TOKEN_STORAGE_KEY, VERDICT_REFRESH_MS } from './constants.ts';
import { clearStorage, safeReturnPath } from './helpers.ts';
import type {
    IAuthupAdapter,
    ISession,
    SessionDeps,
    SessionMethod,
} from './types.ts';

/**
 * Who is signed in, and with which credential: a pasted static token (kept
 * in `sessionStorage` once `GET /me` accepted it) or an authup session.
 * Every credential check passes the token to `me()` explicitly, so a
 * refused one never triggers the client's sign-out.
 *
 * The session also holds the permission names `POST /authorization/check`
 * allowed the principal: asked once a principal is in place (the sign-in
 * waits for the answer, a failed one allows nothing) and again every
 * `VERDICT_REFRESH_MS` (a failed refresh keeps the last answer). A new
 * principal and sign-out empty the names at once; an answer given for an
 * earlier principal is dropped.
 */
export function createSession(config: UiConfig, deps: SessionDeps): ISession {
    const principal = shallowRef<MeWire | undefined>();
    const permissions = shallowRef<ReadonlySet<string>>(new Set());
    let method: SessionMethod | undefined;
    let adapter: Promise<IAuthupAdapter> | undefined;
    // called unbound: a browser's timer functions throw when `this` is not the window
    const { set, clear } = deps.timers ?? { set: setInterval, clear: clearInterval };
    let timer: ReturnType<typeof setInterval> | undefined;
    // bumped per principal: an answer of an earlier one is dropped
    let generation = 0;
    let requested = 0;
    let applied = 0;

    const authup = (): Promise<IAuthupAdapter> => {
        if (!config.auth.authup || !deps.authup) {
            return Promise.reject(new Error('authup sign-in is not configured.'));
        }

        adapter ??= deps.authup();

        return adapter;
    };

    /** Forgets the verdicts at once: no principal, or a new one. */
    const forget = () => {
        generation++;
        permissions.value = new Set();

        if (!(timer !== undefined)) {
            return;
        }

        clear(timer);
        timer = undefined;
    };

    const check = async (current: number, token?: string): Promise<void> => {
        const request = ++requested;

        try {
            const view = await client().checkAuthorization(undefined, token);

            // an older request that answers late never overwrites a newer answer
            if (current === generation && request > applied) {
                applied = request;
                permissions.value = new Set(view.permissions);
            }
        } catch {
            // the first answer failed: nothing allowed; a refresh failed: the last answer stays
        }
    };

    /** A principal is in place: ask now (with its token) and every `VERDICT_REFRESH_MS`. */
    const verify = (token: string): Promise<void> => {
        forget();

        const current = generation;

        timer = set(() => {
            void check(current);
        }, VERDICT_REFRESH_MS);

        return check(current, token);
    };

    const session: ISession = {
        principal,
        permissions,
        get method() {
            return method;
        },
        allowed(name) {
            return permissions.value.has(name);
        },
        async token() {
            if (method === 'authup') {
                return (await authup()).token();
            }

            return deps.storage.getItem(TOKEN_STORAGE_KEY) ?? undefined;
        },
        async refresh() {
            if (method !== 'authup') {
                return false;
            }

            return (await authup()).refresh();
        },
        async restore() {
            const stored = deps.storage.getItem(TOKEN_STORAGE_KEY);

            if (stored) {
                try {
                    principal.value = await client().me(stored);
                    method = 'token';
                    await verify(stored);

                    return true;
                } catch (e) {
                    // only a refused token goes: a network error, a 503
                    // while the server drains or a 429 keeps it, and the
                    // next navigation tries again
                    if (e instanceof ApiError && e.status === 401) {
                        deps.storage.removeItem(TOKEN_STORAGE_KEY);
                    } else {
                        forget();
                        principal.value = undefined;
                        method = undefined;

                        return false;
                    }
                }
            }

            if (config.auth.authup && deps.authup) {
                try {
                    const token = await (await authup()).token();

                    if (token) {
                        principal.value = await client().me(token);
                        method = 'authup';
                        await verify(token);

                        return true;
                    }
                } catch {
                    // an expired or revoked authup session: sign in again
                }
            }

            forget();
            principal.value = undefined;
            method = undefined;

            return false;
        },
        async signInWithToken(token) {
            const me = await client().me(token);

            deps.storage.setItem(TOKEN_STORAGE_KEY, token);
            principal.value = me;
            method = 'token';
            await verify(token);
        },
        async startAuthup(returnTo) {
            const flow = await authup();

            deps.storage.setItem(RETURN_STORAGE_KEY, safeReturnPath(returnTo, '/', config.uiBase));

            const url = await flow.start();

            (deps.navigate ?? ((target: string) => window.location.assign(target)))(url);
        },
        async completeAuthup(query) {
            if (!query.code) {
                throw new Error('The sign-in callback has no code.');
            }

            if (!query.state) {
                throw new Error('The sign-in callback has no state.');
            }

            const flow = await authup();

            await flow.complete(query.code, query.state);

            const token = await flow.token();

            if (!token) {
                throw new Error('authup answered no access token.');
            }

            principal.value = await client().me(token);
            method = 'authup';
            await verify(token);

            const returnTo = safeReturnPath(deps.storage.getItem(RETURN_STORAGE_KEY), '/', config.uiBase);

            deps.storage.removeItem(RETURN_STORAGE_KEY);

            return returnTo;
        },
        async signOut() {
            const wasAuthup = method === 'authup' || adapter !== undefined;

            forget();
            clearStorage(deps.storage);
            principal.value = undefined;
            method = undefined;

            if (wasAuthup) {
                try {
                    await (await authup()).signOut();
                } catch {
                    // the local session is gone either way
                }
            }
        },
    };

    let api: ReturnType<SessionDeps['client']> | undefined;
    function client() {
        api ??= deps.client(session);

        return api;
    }

    return session;
}
