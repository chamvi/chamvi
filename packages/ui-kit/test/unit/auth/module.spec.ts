/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../src/api/error.ts';
import type { IApiClient } from '../../../src/api/types.ts';
import { RETURN_STORAGE_KEY, TOKEN_STORAGE_KEY, VERDICT_REFRESH_MS } from '../../../src/auth/constants.ts';
import { createSession } from '../../../src/auth/module.ts';
import type { IAuthupAdapter } from '../../../src/auth/types.ts';
import { DEV_CONFIG } from '../../../src/config/constants.ts';
import type { UiConfig } from '../../../src/config/types.ts';
import {
    ME,
    apiError,
    fakeClient,
    meFor,
} from '../../utils/client.ts';
import { MemoryStorage } from '../../utils/storage.ts';
import { createFakeIntervals, flush } from '../../utils/timers.ts';

const AUTHUP_CONFIG: UiConfig = {
    ...DEV_CONFIG,
    auth: { tokens: true, authup: { url: 'https://auth.example.com', clientId: 'chamvi' } },
};

function fakeAdapter(token?: string) {
    const calls: string[] = [];
    const adapter: IAuthupAdapter & { calls: string[]; token(): Promise<string | undefined> } = {
        calls,
        start: async () => {
            calls.push('start');

            return 'https://auth.example.com/authorize?x=1';
        },
        complete: async (code, state) => {
            calls.push(`complete:${code}:${state}`);
            token = 'authup-token';
        },
        token: async () => token,
        refresh: async () => {
            calls.push('refresh');

            return false;
        },
        signOut: async () => {
            calls.push('signOut');
            token = undefined;
        },
    };

    return adapter;
}

describe('createSession', () => {
    it('signInWithToken stores the token only after me() accepted it', async () => {
        const storage = new MemoryStorage();
        const session = createSession(DEV_CONFIG, { storage, client: () => fakeClient({ me: meFor('good') }) });

        await session.signInWithToken('good');
        expect(storage.getItem(TOKEN_STORAGE_KEY)).toBe('good');
        expect(session.principal.value).toEqual(ME);
        expect(session.method).toBe('token');
        expect(await session.token()).toBe('good');
    });

    it('signInWithToken with a refused token stores nothing and throws', async () => {
        const storage = new MemoryStorage();
        const session = createSession(DEV_CONFIG, { storage, client: () => fakeClient({ me: meFor('good') }) });

        await expect(session.signInWithToken('bad')).rejects.toBeInstanceOf(ApiError);
        expect(storage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
        expect(session.principal.value).toBeUndefined();
    });

    it('restore uses the stored token', async () => {
        const storage = new MemoryStorage();

        storage.setItem(TOKEN_STORAGE_KEY, 'good');

        const session = createSession(DEV_CONFIG, { storage, client: () => fakeClient({ me: meFor('good') }) });

        expect(await session.restore()).toBe(true);
        expect(session.principal.value).toEqual(ME);
    });

    it('restore is false and clears a token me() refuses', async () => {
        const storage = new MemoryStorage();

        storage.setItem(TOKEN_STORAGE_KEY, 'revoked');

        const session = createSession(DEV_CONFIG, { storage, client: () => fakeClient({ me: meFor('good') }) });

        expect(await session.restore()).toBe(false);
        expect(storage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
        expect(session.principal.value).toBeUndefined();
    });

    it('restore keeps the stored token when me() fails with anything but 401', async () => {
        for (const error of [apiError(503, 'service_unavailable'), apiError(429, 'too_many_requests'), new TypeError('fetch failed')]) {
            const storage = new MemoryStorage();

            storage.setItem(TOKEN_STORAGE_KEY, 'good');

            const session = createSession(DEV_CONFIG, {
                storage,
                client: () => fakeClient({
                    me: async () => {
                        throw error;
                    },
                }),
            });

            expect(await session.restore()).toBe(false);
            expect(storage.getItem(TOKEN_STORAGE_KEY)).toBe('good');
            expect(session.principal.value).toBeUndefined();
        }
    });

    it('restore is false without any credential', async () => {
        const session = createSession(DEV_CONFIG, { storage: new MemoryStorage(), client: () => fakeClient() });

        expect(await session.restore()).toBe(false);
    });

    it('restore uses the authup session', async () => {
        const adapter = fakeAdapter('authup-token');
        const session = createSession(AUTHUP_CONFIG, {
            storage: new MemoryStorage(),
            client: () => fakeClient({ me: meFor('authup-token') }),
            authup: async () => adapter,
        });

        expect(await session.restore()).toBe(true);
        expect(session.method).toBe('authup');
        expect(await session.token()).toBe('authup-token');
    });

    it('signOut clears token, principal and the authup session', async () => {
        const storage = new MemoryStorage();
        const adapter = fakeAdapter('authup-token');
        const session = createSession(AUTHUP_CONFIG, {
            storage,
            client: () => fakeClient({ me: meFor('authup-token') }),
            authup: async () => adapter,
        });

        await session.restore();
        storage.setItem(TOKEN_STORAGE_KEY, 'x');
        storage.setItem(RETURN_STORAGE_KEY, '/runs');
        storage.setItem('chamvi.authup.access_token', '"at"');
        storage.setItem('other', 'kept');
        await session.signOut();
        expect(storage.length).toBe(1);
        expect(storage.getItem('other')).toBe('kept');
        expect(session.principal.value).toBeUndefined();
        expect(session.method).toBeUndefined();
        expect(adapter.calls).toContain('signOut');
        expect(await session.token()).toBeUndefined();
    });

    it('refresh asks the authup adapter, never for a pasted token', async () => {
        const adapter = fakeAdapter('authup-token');
        const session = createSession(AUTHUP_CONFIG, {
            storage: new MemoryStorage(),
            client: () => fakeClient({ me: meFor('authup-token', 'good') }),
            authup: async () => adapter,
        });

        await session.signInWithToken('good');
        expect(await session.refresh()).toBe(false);
        expect(adapter.calls).not.toContain('refresh');
        await session.signOut();
        await session.restore();
        await session.refresh();
        expect(adapter.calls).toContain('refresh');
    });

    it('startAuthup keeps the return path and completeAuthup hands it back', async () => {
        const storage = new MemoryStorage();
        const adapter = fakeAdapter();
        const visited: string[] = [];
        const session = createSession(AUTHUP_CONFIG, {
            storage,
            client: () => fakeClient({ me: meFor('authup-token') }),
            authup: async () => adapter,
            navigate: (url) => {
                visited.push(url);
            },
        });

        await session.startAuthup('/approvals?x=1');
        expect(storage.getItem(RETURN_STORAGE_KEY)).toBe('/approvals?x=1');
        expect(visited).toEqual(['https://auth.example.com/authorize?x=1']);

        expect(await session.completeAuthup({ code: 'c', state: 's' })).toBe('/approvals?x=1');
        expect(adapter.calls).toContain('complete:c:s');
        expect(storage.getItem(RETURN_STORAGE_KEY)).toBeNull();
        expect(session.principal.value).toEqual(ME);
        expect(session.method).toBe('authup');
    });

    it('completeAuthup returns / without a usable return path', async () => {
        const storage = new MemoryStorage();

        storage.setItem(RETURN_STORAGE_KEY, '//evil.example.com');

        const session = createSession(AUTHUP_CONFIG, {
            storage,
            client: () => fakeClient({ me: meFor('authup-token') }),
            authup: async () => fakeAdapter(),
        });

        expect(await session.completeAuthup({ code: 'c', state: 's' })).toBe('/');
    });

    it('completeAuthup rejects a missing code or state', async () => {
        const session = createSession(AUTHUP_CONFIG, {
            storage: new MemoryStorage(),
            client: () => fakeClient(),
            authup: async () => fakeAdapter(),
        });

        await expect(session.completeAuthup({ state: 's' })).rejects.toThrow(/code/);
        await expect(session.completeAuthup({ code: 'c' })).rejects.toThrow(/state/);
    });

    it('startAuthup without authup configured rejects', async () => {
        const session = createSession(DEV_CONFIG, { storage: new MemoryStorage(), client: () => fakeClient() });

        await expect(session.startAuthup('/')).rejects.toThrow(/authup/);
    });
});

describe('createSession verdicts', () => {
    type Pending = {
        token: string | undefined;
        resolve: (names: string[]) => void;
        reject: (error: unknown) => void
    };

    /** A check that answers only when the test resolves the pending call. */
    function gatedCheck() {
        const calls: Pending[] = [];
        const check: IApiClient['checkAuthorization'] = (_names, token) => new Promise((resolve, reject) => {
            calls.push({
                token,
                resolve: (permissions) => resolve({ permissions }),
                reject,
            });
        });

        return { calls, check };
    }

    function setup(options: { check: IApiClient['checkAuthorization']; me?: IApiClient['me'] }) {
        const storage = new MemoryStorage();
        const intervals = createFakeIntervals();
        const session = createSession(DEV_CONFIG, {
            storage,
            client: () => fakeClient({ me: options.me ?? meFor('good', 'other'), checkAuthorization: options.check }),
            timers: intervals.timers,
        });

        return {
            storage,
            intervals,
            session,
        };
    }

    it('holds the names the check allowed after signInWithToken', async () => {
        const { session } = setup({ check: async () => ({ permissions: ['chamvi_run_read', 'chamvi_agent_read'] }) });

        await session.signInWithToken('good');
        await flush();
        expect([...session.permissions.value]).toEqual(['chamvi_run_read', 'chamvi_agent_read']);
        expect(session.allowed('chamvi_run_read')).toBe(true);
        expect(session.allowed('chamvi_agent_run')).toBe(false);
    });

    it('holds the names the check allowed after restore', async () => {
        const { session, storage } = setup({ check: async () => ({ permissions: ['chamvi_run_read'] }) });

        storage.setItem(TOKEN_STORAGE_KEY, 'good');
        expect(await session.restore()).toBe(true);
        await flush();
        expect(session.allowed('chamvi_run_read')).toBe(true);
        expect(session.allowed('chamvi_run_cancel')).toBe(false);
    });

    it('allows nothing before the check answers, and signs in meanwhile', async () => {
        const { calls, check } = gatedCheck();
        const { session } = setup({ check });

        expect(session.allowed('chamvi_run_read')).toBe(false);

        const signedIn = session.signInWithToken('good');

        await flush();
        expect(session.principal.value).toEqual(ME);
        expect(session.permissions.value.size).toBe(0);
        expect(session.allowed('chamvi_run_read')).toBe(false);
        expect(calls).toHaveLength(1);

        calls[0]!.resolve(['chamvi_run_read']);
        await signedIn;
        await flush();
        expect(session.allowed('chamvi_run_read')).toBe(true);
    });

    it('allows nothing when the initial check fails, and stays signed in', async () => {
        const { session } = setup({
            check: async () => {
                throw apiError(503, 'service_unavailable');
            },
        });

        await session.signInWithToken('good');
        await flush();
        expect(session.principal.value).toEqual(ME);
        expect(session.allowed('chamvi_run_read')).toBe(false);
    });

    it('asks again every VERDICT_REFRESH_MS and keeps the last answer when a refresh fails', async () => {
        const { calls, check } = gatedCheck();
        const { session, intervals } = setup({ check });
        const signedIn = session.signInWithToken('good');

        await flush();
        calls[0]!.resolve(['chamvi_run_read']);
        await signedIn;
        await flush();
        expect(intervals.pending()).toEqual([VERDICT_REFRESH_MS]);

        intervals.tick();
        await flush();
        expect(calls).toHaveLength(2);
        calls[1]!.resolve(['chamvi_run_read', 'chamvi_run_cancel']);
        await flush();
        expect(session.allowed('chamvi_run_cancel')).toBe(true);

        intervals.tick();
        await flush();
        calls[2]!.reject(new TypeError('fetch failed'));
        await flush();
        expect([...session.permissions.value]).toEqual(['chamvi_run_read', 'chamvi_run_cancel']);

        intervals.tick();
        await flush();
        calls[3]!.resolve([]);
        await flush();
        expect(session.permissions.value.size).toBe(0);
    });

    it('signOut empties the names at once and stops asking', async () => {
        const { calls, check } = gatedCheck();
        const { session, intervals } = setup({ check });
        const signedIn = session.signInWithToken('good');

        await flush();
        calls[0]!.resolve(['chamvi_run_read']);
        await signedIn;
        await flush();

        intervals.tick();
        await flush();

        const signedOut = session.signOut();

        expect(session.permissions.value.size).toBe(0);
        expect(session.allowed('chamvi_run_read')).toBe(false);
        expect(intervals.pending()).toEqual([]);

        // the refresh that was in flight answers after the sign-out
        calls[1]!.resolve(['chamvi_run_read']);
        await signedOut;
        await flush();
        expect(session.allowed('chamvi_run_read')).toBe(false);

        intervals.tick();
        await flush();
        expect(calls).toHaveLength(2);
    });

    it('drops the late answer of a previous principal', async () => {
        const { calls, check } = gatedCheck();
        const { session, intervals } = setup({ check });
        const first = session.signInWithToken('good');

        await flush();

        const second = session.signInWithToken('other');

        await flush();
        expect(calls).toHaveLength(2);

        calls[1]!.resolve(['chamvi_agent_read']);
        await second;
        await flush();
        calls[0]!.resolve(['chamvi_run_read', 'chamvi_agent_run']);
        await first;
        await flush();
        expect([...session.permissions.value]).toEqual(['chamvi_agent_read']);
        expect(intervals.pending()).toEqual([VERDICT_REFRESH_MS]);
    });
});
