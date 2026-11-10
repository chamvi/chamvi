/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { createApp } from 'vue';
import { AUTHUP_STORAGE_PREFIX } from '../../../src/auth/constants.ts';
import { clearStorage, createSessionCookies } from '../../../src/auth/helpers.ts';
import { MemoryStorage } from '../../utils/storage.ts';

// the kit needs a browser and an authup server: only its install options
// and the store's token are observed here
const kit = vi.hoisted(() => ({
    installed: [] as Record<string, unknown>[],
    store: {
        accessToken: undefined as string | undefined,
        resolve: async () => {},
        logout: async () => {},
    },
}));

vi.mock('@authup/client-web-kit', () => ({
    install: (_app: unknown, options: Record<string, unknown>) => {
        kit.installed.push(options);
    },
    injectStore: () => kit.store,
    buildAuthorizeURL: () => 'https://auth.example.com/authorize',
    clearAuthorizationRequest: () => {},
    createPKCE: async () => ({
        code_verifier: 'v',
        code_challenge: 'c',
        code_challenge_method: 'S256',
    }),
    createState: () => 'state',
    loadAuthorizationRequest: () => undefined,
    saveAuthorizationRequest: () => {},
}));

const CONFIG = { url: 'https://auth.example.com', clientId: 'chamvi' };

const ROOT = { render: () => null };

describe('createSessionCookies', () => {
    it('keeps values as JSON under the authup prefix and clearStorage removes them', () => {
        const storage = new MemoryStorage();
        const cookies = createSessionCookies(storage);
        const expires = new Date('2026-10-21T12:00:00.000Z');

        cookies.cookieSet('access_token', 'at');
        cookies.cookieSet('access_token_expire_date', expires);
        cookies.cookieSet('realm_management', { id: 'r1', name: 'master' });
        expect(storage.getItem(`${AUTHUP_STORAGE_PREFIX}access_token`)).toBe('"at"');
        expect(cookies.cookieGet('access_token')).toBe('at');
        expect(new Date(cookies.cookieGet('access_token_expire_date') as string)).toEqual(expires);
        expect(cookies.cookieGet('realm_management')).toEqual({ id: 'r1', name: 'master' });
        expect(cookies.cookieGet('missing')).toBeUndefined();

        cookies.cookieSet('access_token', null);
        expect(cookies.cookieGet('access_token')).toBeUndefined();
        cookies.cookieUnset('realm_management');
        expect(cookies.cookieGet('realm_management')).toBeUndefined();

        storage.setItem(`${AUTHUP_STORAGE_PREFIX}broken`, '{');
        expect(cookies.cookieGet('broken')).toBeUndefined();
        clearStorage(storage);
        expect(storage.length).toBe(0);
    });

    it('ignores an unset aimed at another cookie path, so a reload keeps the tokens', () => {
        const storage = new MemoryStorage();
        const cookies = createSessionCookies(storage, '/ui');

        cookies.cookieSet('access_token', 'at');

        // the kit drops cookies shadowing the pinned path on install, for
        // each prefix of the page's path other than the pinned one
        cookies.cookieUnset('access_token', { path: '/' });
        cookies.cookieUnset('access_token', { path: '/ui/runs' });
        expect(cookies.cookieGet('access_token')).toBe('at');

        cookies.cookieUnset('access_token', { path: '/ui' });
        expect(cookies.cookieGet('access_token')).toBeUndefined();
    });
});

describe('createAuthupAdapter', () => {
    beforeEach(() => {
        kit.installed.length = 0;
        kit.store.accessToken = undefined;
        kit.store.resolve = async () => {};
        vi.stubGlobal('window', { location: { protocol: 'http:', origin: 'http://localhost' } });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('hands the kit storage-backed cookie functions, never document.cookie', async () => {
        const { createAuthupAdapter } = await import('../../../src/auth/authup.ts');
        const storage = new MemoryStorage();

        createAuthupAdapter(createApp(ROOT), CONFIG, '/ui', storage);

        const options = kit.installed[0]!;

        expect(typeof options.cookieGet).toBe('function');
        expect(typeof options.cookieSet).toBe('function');
        expect(typeof options.cookieUnset).toBe('function');
        (options.cookieSet as (key: string, value: unknown, opts: unknown) => void)('refresh_token', 'rt', { path: '/ui' });
        expect(storage.getItem(`${AUTHUP_STORAGE_PREFIX}refresh_token`)).toBe('"rt"');

        const unset = options.cookieUnset as (key: string, opts: unknown) => void;

        // the kit's normalized form, the path its own unsets carry
        expect(options.cookiePath).toBe('/ui');
        unset('refresh_token', { path: '/ui/runs' });
        expect(storage.getItem(`${AUTHUP_STORAGE_PREFIX}refresh_token`)).toBe('"rt"');
        unset('refresh_token', { path: '/ui' });
        expect(storage.getItem(`${AUTHUP_STORAGE_PREFIX}refresh_token`)).toBeNull();
    });

    it('refresh is true while a token is in place, also when another call already rotated it', async () => {
        const { createAuthupAdapter } = await import('../../../src/auth/authup.ts');
        const adapter = createAuthupAdapter(createApp(ROOT), CONFIG, '/ui', new MemoryStorage());

        kit.store.accessToken = 'rotated-by-another-request';
        expect(await adapter.refresh()).toBe(true);

        kit.store.accessToken = undefined;
        expect(await adapter.refresh()).toBe(false);

        kit.store.accessToken = 'x';
        kit.store.resolve = async () => {
            throw new Error('refresh token revoked');
        };
        expect(await adapter.refresh()).toBe(false);
    });
});
