/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '@chamvi/core';
import { describe, expect, it } from 'vitest';
import { readUiAuth } from '@chamvi/app';

const URL = 'https://auth.example.com/api';

describe('readUiAuth', () => {
    it('offers the token login only without AUTHUP_URL', () => {
        expect(readUiAuth({})).toEqual({ tokens: true });
        expect(readUiAuth({ AUTHUP_REALM: 'tenant' })).toEqual({ tokens: true });
    });

    it('offers the authup login with AUTHUP_URL alone, as the client chamvi of the realm master', () => {
        expect(readUiAuth({ AUTHUP_URL: URL })).toEqual({
            tokens: true,
            authup: {
                url: URL,
                clientId: 'chamvi',
                realmId: 'master',
            },
        });
    });

    it('takes the realm from AUTHUP_REALM', () => {
        expect(readUiAuth({ AUTHUP_URL: URL, AUTHUP_REALM: 'tenant' }).authup).toMatchObject({ clientId: 'chamvi', realmId: 'tenant' });
    });

    it('lets AUTHUP_CLIENT_ID name the client, in the realm AUTHUP_REALM', () => {
        expect(readUiAuth({
            AUTHUP_URL: URL,
            AUTHUP_REALM: 'tenant',
            AUTHUP_CLIENT_ID: 'dashboard',
        }).authup).toEqual({
            url: URL,
            clientId: 'dashboard',
            realmId: 'tenant',
        });
    });

    it('requires AUTHUP_URL for AUTHUP_CLIENT_ID', () => {
        expect(() => readUiAuth({ AUTHUP_CLIENT_ID: 'dashboard' }))
            .toThrow(new InvalidAgentDefinitionError('AUTHUP_URL is required.'));
    });
});
