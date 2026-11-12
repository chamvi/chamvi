/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Ref } from 'vue';
import type { IApiClient, MeWire } from '../api/types.ts';

/** The authup code flow, loaded only when `auth.authup` is configured. */
export interface IAuthupAdapter {
    /** Saves state and PKCE verifier, answers the authorize URL to go to. */
    start(): Promise<string>;
    /** Exchanges the callback's code (state checked against the saved one). */
    complete(code: string, state: string): Promise<void>;
    token(): Promise<string | undefined>;
    /** `true` when a new access token is in place. */
    refresh(): Promise<boolean>;
    signOut(): Promise<void>;
}

export type SessionMethod = 'token' | 'authup';

export interface ISession {
    readonly principal: Ref<MeWire | undefined>;
    readonly method: SessionMethod | undefined;
    /**
     * The permission names `POST /authorization/check` allowed the principal,
     * asked on sign-in, on restore and every `VERDICT_REFRESH_MS`; empty
     * while unloaded, after a failed first answer and after sign-out. An
     * upper bound: a control it shows may still meet a 403.
     */
    readonly permissions: Readonly<Ref<ReadonlySet<string>>>;
    /** The principal may attempt `name` (reads `permissions`, so it is reactive). */
    allowed(name: string): boolean;
    token(): Promise<string | undefined>;
    refresh(): Promise<boolean>;
    restore(): Promise<boolean>;
    signInWithToken(token: string): Promise<void>;
    startAuthup(returnTo: string): Promise<void>;
    /** Answers the path to return to. */
    completeAuthup(query: { code?: string; state?: string }): Promise<string>;
    signOut(): Promise<void>;
}

export type SessionDeps = {
    storage: Storage;
    client: (session: ISession) => IApiClient;
    authup?: () => Promise<IAuthupAdapter>;
    /** Leaves the page for the authorize URL. Default `location.assign`. */
    navigate?: (url: string) => void;
    /** The interval that asks the permission check again; called unbound (default `setInterval`/`clearInterval`). */
    timers?: { set: typeof setInterval; clear: typeof clearInterval };
};

export type SessionCookieOptions = {
    path?: string;
};

export type SessionCookies = {
    cookieGet: (key: string) => unknown;
    cookieSet: (key: string, value: unknown) => void;
    cookieUnset: (key: string, options?: SessionCookieOptions) => void;
};
