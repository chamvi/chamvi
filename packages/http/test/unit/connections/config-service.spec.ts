/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomBytes } from 'node:crypto';
import {
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { Permission } from '@chamvi/access';
import type { PermissionBinding } from '@chamvi/access';
import {
    ChamviError,
    InvalidAgentDefinitionError,
    createConnectionConfigStore,
    createKeyring,
    createMemoryStore,
    resolveConnection,
} from '@chamvi/core';
import type {
    ConnectionTypeDefinition,
    DeclaredConnection,
    IConnectionConfigStore,
    IConnectionTypeProvider,
} from '@chamvi/core';
import { ControllableClock } from '@chamvi/test-kit';
import type { Principal } from '@chamvi/http';
import { ConnectionConfigService } from '../../../src/connections/service/index.ts';
import type { IConnectionConfigService } from '../../../src/connections/types.ts';

const PASSWORD = 'hunter2-plaintext-secret';

function principalOf(...grants: Array<string | PermissionBinding>): Principal {
    return {
        id: 'p',
        kind: 'token',
        bindings: grants.map((grant) => (typeof grant === 'string' ? { permission: { name: grant } } : grant)),
    };
}

function mailDefinition(overrides: Partial<ConnectionTypeDefinition> = {}): ConnectionTypeDefinition {
    return {
        type: 'mail',
        label: 'Mail',
        multiple: true,
        fields: [
            {
                key: 'host',
                label: 'Host',
                kind: 'string',
                required: true,
            },
            {
                key: 'password',
                label: 'Password',
                kind: 'secret',
                required: true,
            },
        ],
        ...overrides,
    };
}

function declare(definition: ConnectionTypeDefinition, name: string, overrides: Partial<DeclaredConnection> = {}): DeclaredConnection {
    return {
        name,
        editable: true,
        deletable: false,
        resolved: resolveConnection({
            definition, 
            name, 
            readVariable: () => undefined, 
        }),
        ...overrides,
    };
}

type SetupOptions = {
    definition?: ConnectionTypeDefinition;
    declared?: (definition: ConnectionTypeDefinition) => DeclaredConnection[];
    keyring?: () => ReturnType<typeof createKeyring>;
    configs?: (real: IConnectionConfigStore) => IConnectionConfigStore;
};

function setup(options: SetupOptions = {}) {
    const clock = new ControllableClock(new Date(1_000_000));
    const store = createMemoryStore({ clock });
    const definition = options.definition ?? mailDefinition();
    const declared = options.declared?.(definition) ?? [];
    const provider: IConnectionTypeProvider = {
        definition,
        creatable: () => true,
        connections: () => declared,
    };
    const key = randomBytes(32);
    const real = createConnectionConfigStore({
        store,
        clock,
        keyring: options.keyring ?? (() => createKeyring([{ id: 'k1', key }])),
    });
    const configs = options.configs ? options.configs(real) : real;
    // through the contract: the controller passes the principal to every method
    const service: IConnectionConfigService = new ConnectionConfigService({
        connections: () => [],
        connectionTypes: () => [provider],
        connectionConfigs: configs,
        store,
        clock,
        onError: () => undefined,
        uiPages: () => [{
            slug: 'mail', 
            label: 'Mail', 
            types: ['mail'], 
            path: '/ext/mail',
        }],
        basePath: '/api',
    });

    return { service, configs };
}

const nobody = principalOf();
const reader = principalOf(Permission.CONNECTION_READ);
const writer = principalOf(Permission.CONNECTION_WRITE);
const creator = principalOf(Permission.CONNECTION_CREATE, Permission.CONNECTION_WRITE);
const createBody = {
    account: 'work', 
    settings: { host: 'imap.example.org' }, 
    secrets: { password: PASSWORD }, 
};

describe('ConnectionConfigService', () => {
    it('lists the types and the ui pages under the base path', async () => {
        const { service } = setup();

        expect((await service.types(nobody)).data.map((view) => view.type)).toEqual(['mail']);
        expect(await service.uiPages(nobody)).toEqual({
            data: [{
                slug: 'mail', 
                label: 'Mail', 
                types: ['mail'], 
                path: '/api/ext/mail',
            }],
        });
    });

    it('refuses a create without the grant (403) before the type lookup (404)', async () => {
        const { service } = setup();

        await expect(service.create('mail', createBody, writer)).rejects.toMatchObject({ status: 403 });
        await expect(service.create('nope', createBody, writer)).rejects.toMatchObject({ status: 403 });
        await expect(service.create('nope', createBody, creator)).rejects.toMatchObject({ status: 404 });
    });

    it('refuses a create of a type without instances (409)', async () => {
        const { service } = setup({ definition: mailDefinition({ multiple: false }) });

        await expect(service.create('mail', createBody, creator)).rejects.toMatchObject({ status: 409 });
    });

    it('creates an account and never returns its secret', async () => {
        const { service } = setup();
        const view = await service.create('mail', createBody, creator);

        expect(view).toMatchObject({
            name: 'mail-work', 
            type: 'mail', 
            state: 'configured', 
        });
        expect(JSON.stringify(view)).not.toContain(PASSWORD);
    });

    it('reads a configuration: 403 without a grant, 404 for an unknown name only for a reader', async () => {
        const { service } = setup({ declared: (definition) => [declare(definition, 'mail-work')] });

        await expect(service.read('mail-work', nobody)).rejects.toMatchObject({ status: 403 });
        await expect(service.read('nope', nobody)).rejects.toMatchObject({ status: 403 });
        await expect(service.read('nope', reader)).rejects.toMatchObject({ status: 404 });
        expect(await service.read('mail-work', reader)).toMatchObject({ type: 'mail', editable: true });
    });

    it('holds a lookup error back until the check passed', async () => {
        const { service } = setup();

        await expect(service.read('NOT_VALID', nobody)).rejects.toMatchObject({ status: 403 });
    });

    it('refuses an update without write (403) and of a connection set in code (409)', async () => {
        const { service } = setup({ declared: (definition) => [declare(definition, 'mail-work', { editable: false })] });
        const data = { settings: { host: 'h' }, secrets: { set: { password: PASSWORD } } };

        await expect(service.update('mail-work', data, reader)).rejects.toMatchObject({ status: 403 });
        await expect(service.update('mail-work', data, writer)).rejects.toMatchObject({ status: 409 });
    });

    it('refuses an update without the keyring as a 409 naming the variable', async () => {
        const { service } = setup({
            declared: (definition) => [declare(definition, 'mail-work')],
            keyring: () => {
                throw new InvalidAgentDefinitionError('CHAMVI_ENCRYPTION_KEYS is not set.');
            },
        });
        const promise = service.update('mail-work', { settings: { host: 'h' }, secrets: { set: { password: PASSWORD } } }, writer);

        await expect(promise).rejects.toMatchObject({ status: 409 });
        await expect(promise).rejects.toThrow('CHAMVI_ENCRYPTION_KEYS');
    });

    it('refuses deleting a declared connection (409) and deletes a stored account as the principal', async () => {
        const deleted = vi.fn();
        const { service } = setup({
            declared: (definition) => [declare(definition, 'mail-env')],
            configs: (real) => ({
                ...real,
                delete: async (name, owner) => {
                    deleted(name, owner);

                    return real.delete(name, owner);
                },
            }),
        });

        await expect(service.delete('mail-env', reader)).rejects.toMatchObject({ status: 403 });
        await expect(service.delete('mail-env', writer)).rejects.toMatchObject({ status: 409 });

        await service.create('mail', createBody, creator);

        expect(await service.delete('mail-work', writer)).toEqual({ restartRequired: false });
        expect(deleted).toHaveBeenCalledWith('mail-work', 'http:p');
    });

    it('refuses a test without write (403) and with required fields missing (409)', async () => {
        const test = vi.fn(async () => undefined);
        const { service } = setup({
            definition: mailDefinition({ test }),
            declared: (definition) => [declare(definition, 'mail-work')],
        });
        const { signal } = new AbortController();

        await expect(service.test('mail-work', signal, reader)).rejects.toMatchObject({ status: 403 });
        await expect(service.test('mail-work', signal, writer)).rejects.toMatchObject({ status: 409, message: 'Save Host, Password first.' });
        expect(test).not.toHaveBeenCalled();
    });

    it('tests saved values with the request signal and hides the secrets in a failure', async () => {
        const test = vi.fn<NonNullable<ConnectionTypeDefinition['test']>>(async () => {
            throw new ChamviError({ message: `login refused for ${PASSWORD}`, code: 'mail_request' });
        });
        const { service } = setup({ definition: mailDefinition({ test }) });
        const controller = new AbortController();

        await service.create('mail', createBody, creator);

        expect(await service.test('mail-work', controller.signal, writer)).toEqual({ ok: false, message: 'login refused for [secret]' });

        const [values, signal] = test.mock.calls[0] ?? [];

        expect(values).toEqual({ host: 'imap.example.org', password: PASSWORD });
        controller.abort();
        expect(signal?.aborted).toBe(true);
    });
});
