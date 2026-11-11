/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { Permission, allPermissions, can } from '@chamvi/access';
import type { PermissionBinding } from '@chamvi/access';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { staticTokens } from '@chamvi/http';

const TOKEN = 'ci-token-0123456789';
const ROTATED = 'ci-token-9876543210';
const ADMIN = 'admin-token-0123456789';

const READ: PermissionBinding = { permission: { name: Permission.RUN_READ } };
const TRIAGE_ONLY: PermissionBinding = {
    permission: { name: Permission.AGENT_RUN },
    policies: [{ type: 'attributes', query: { name: 'triage' } } as never],
};

const request = (authorization?: string) => new Request('http://test', { headers: authorization ? { authorization } : {} });

describe('staticTokens', () => {
    const auth = staticTokens({
        tokens: [{
            value: TOKEN,
            id: 'ci',
            permissions: [READ],
        }],
    });

    it('resolves the principal of a known token', async () => {
        expect(await auth(request(`Bearer ${TOKEN}`))).toEqual({
            id: 'ci',
            kind: 'token',
            permissions: [READ],
        });
    });

    it('expands "*" to every chamvi permission, unrestricted', async () => {
        const admin = staticTokens({
            tokens: [{
                value: ADMIN, 
                id: 'admin', 
                permissions: '*', 
            }], 
        });

        expect(await admin(request(`Bearer ${ADMIN}`))).toEqual({
            id: 'admin',
            kind: 'token',
            permissions: allPermissions(),
        });
    });

    it('keeps a restricted binding as configured', async () => {
        const restricted = staticTokens({
            tokens: [{
                value: ADMIN, 
                id: 'triage', 
                permissions: [TRIAGE_ONLY], 
            }], 
        });
        const principal = await restricted(request(`Bearer ${ADMIN}`));

        expect(principal?.permissions).toEqual([TRIAGE_ONLY]);
        await expect(can(principal!, Permission.AGENT_RUN, { attributes: { name: 'triage', private: false } })).resolves.toBe(true);
        await expect(can(principal!, Permission.AGENT_RUN, { attributes: { name: 'other', private: false } })).resolves.toBe(false);
    });

    it('answers a copy, so a caller cannot change the configured grants', async () => {
        const restricted = staticTokens({
            tokens: [{
                value: ADMIN, 
                id: 'triage', 
                permissions: [TRIAGE_ONLY], 
            }], 
        });
        const first = await restricted(request(`Bearer ${ADMIN}`));

        (first!.permissions[0] as { permission: { name: string } }).permission.name = 'changed';

        expect((await restricted(request(`Bearer ${ADMIN}`)))?.permissions).toEqual([TRIAGE_ONLY]);
    });

    it.each([
        ['an old string entry', ['agent:triage:run']],
        ['"*" inside the list', ['*']],
        ['a binding without a name', [{ permission: {} }]],
        ['a string other than "*"', 'run:read'],
    ])('rejects %s, naming the token and the binding shape', (_name, permissions) => {
        expect(() => staticTokens({
            tokens: [{
                value: ADMIN, 
                id: 'ci', 
                permissions: permissions as never, 
            }], 
        })).toThrow(
            'Static token "ci": permissions must be "*" or an array of permission bindings ({ permission: { name }, policies? }).',
        );
        expect(() => staticTokens({
            tokens: [{
                value: ADMIN, 
                id: 'ci', 
                permissions: permissions as never, 
            }], 
        })).toThrow(InvalidAgentDefinitionError);
    });

    it('resolves undefined without a header or for an unknown token', async () => {
        expect(await auth(request())).toBeUndefined();
        expect(await auth(request('Bearer unknown-token-0123456789'))).toBeUndefined();
    });

    it('rejects another scheme with 401', async () => {
        await expect(auth(request('Basic abc'))).rejects.toMatchObject({ status: 401 });
    });

    it('resolves every token of a principal that holds several', async () => {
        const rotating = staticTokens({
            tokens: [
                {
                    value: TOKEN,
                    id: 'ci',
                    permissions: [READ],
                },
                {
                    value: ROTATED,
                    id: 'ci',
                    permissions: [READ],
                },
            ],
        });

        expect(await rotating(request(`Bearer ${TOKEN}`))).toMatchObject({ id: 'ci' });
        expect(await rotating(request(`Bearer ${ROTATED}`))).toMatchObject({ id: 'ci' });
    });

    it('rejects short tokens and an empty list', () => {
        expect(() => staticTokens({
            tokens: [{
                value: 'short',
                id: 'x',
                permissions: [],
            }],
        })).toThrow(InvalidAgentDefinitionError);
        expect(() => staticTokens({ tokens: [] })).toThrow(InvalidAgentDefinitionError);
    });

    it('rejects tokens that are no array', () => {
        expect(() => staticTokens({ tokens: { [TOKEN]: { id: 'ci', permissions: [] } } as never })).toThrow(InvalidAgentDefinitionError);
    });

    it('rejects a token without a string value', () => {
        expect(() => staticTokens({ tokens: [{ id: 'ci', permissions: [] } as never] })).toThrow(InvalidAgentDefinitionError);
    });

    it('rejects a token without an id', () => {
        expect(() => staticTokens({
            tokens: [{
                value: TOKEN,
                id: '',
                permissions: [],
            }],
        })).toThrow(InvalidAgentDefinitionError);
    });

    it('rejects a token value given twice', () => {
        expect(() => staticTokens({
            tokens: [
                {
                    value: TOKEN,
                    id: 'ci',
                    permissions: [READ],
                },
                {
                    value: TOKEN,
                    id: 'admin',
                    permissions: '*',
                },
            ],
        })).toThrow(InvalidAgentDefinitionError);
    });
});
