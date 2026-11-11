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
import {
    ConnectionChangedError,
    InvalidAgentDefinitionError,
    createConnectionConfigStore,
    createKeyring,
    createMemoryStore,
    resolveConnection,
} from '@chamvi/core';
import type {
    ConnectionTypeDefinition,
    ConnectionValues,
    DeclaredConnection,
    IConnectionConfigStore,
    IConnectionTypeProvider,
    IStore,
} from '@chamvi/core';
import { ControllableClock } from '@chamvi/test-kit';
import { CONNECTIONS_CREATE_PERMISSION } from '@chamvi/http';
import {
    ADMIN_TOKEN,
    call,
    createTestApp,
    tokenFor,
} from '../../utils/app.ts';

const PASSWORD = 'hunter2-plaintext-secret';
const CREATE = CONNECTIONS_CREATE_PERMISSION;

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
                env: () => 'MAIL_HOST',
            },
            {
                key: 'port',
                label: 'Port',
                kind: 'number',
            },
            {
                key: 'password',
                label: 'Password',
                kind: 'secret',
                required: true,
                env: () => 'MAIL_PASSWORD',
            },
        ],
        uniqueId: (values) => String(values.host),
        ...overrides,
    };
}

function declare(
    definition: ConnectionTypeDefinition,
    name: string,
    env: Record<string, string> = {},
    overrides: Partial<DeclaredConnection> = {},
): DeclaredConnection {
    return {
        name,
        editable: true,
        deletable: false,
        resolved: resolveConnection({
            definition,
            name,
            readVariable: (variable) => env[variable],
        }),
        ...overrides,
    };
}

type WorldOptions = {
    definition?: ConnectionTypeDefinition;
    creatable?: boolean;
    declared?: (definition: ConnectionTypeDefinition) => DeclaredConnection[];
    configs?: (real: IConnectionConfigStore) => IConnectionConfigStore;
    store?: IStore;
    noConfigs?: boolean;
    keyring?: () => ReturnType<typeof createKeyring>;
    uiPages?: Parameters<typeof createTestApp>[0] extends infer O ? O extends { uiPages?: infer U } ? U : never : never;
    basePath?: string;
};

function world(options: WorldOptions = {}) {
    const clock = new ControllableClock(new Date(1_000_000));
    const store = options.store ?? createMemoryStore({ clock });
    const definition = options.definition ?? mailDefinition();
    const declared = options.declared?.(definition) ?? [];
    const provider: IConnectionTypeProvider = {
        definition,
        creatable: () => options.creatable ?? true,
        connections: () => declared,
    };
    const key = randomBytes(32);
    const real = createConnectionConfigStore({
        store,
        clock,
        keyring: options.keyring ?? (() => createKeyring([{ id: 'k1', key }])),
    });
    const configs = options.configs ? options.configs(real) : real;
    const errors: unknown[] = [];
    const { app } = createTestApp({
        store,
        clock,
        connectionTypes: () => [provider],
        ...(options.noConfigs ? {} : { connectionConfigs: configs }),
        ...(options.uiPages ? { uiPages: options.uiPages } : {}),
        ...(options.basePath ? { basePath: options.basePath } : {}),
        onError: (error) => {
            errors.push(error);
        },
    });

    return {
        app,
        store,
        real,
        clock,
        declared,
        errors,
    };
}

async function json(response: Response): Promise<any> {
    return response.json();
}

function twoSecretsDefinition(): ConnectionTypeDefinition {
    return mailDefinition({
        fields: [
            {
                key: 'password',
                label: 'Password',
                kind: 'secret',
                required: true,
            },
            {
                key: 'token',
                label: 'Token',
                kind: 'secret',
                required: true,
            },
        ],
        uniqueId: undefined,
    });
}

describe('connection configuration', () => {
    describe('clearing secrets', () => {
        it('clears one required secret after another: a clear-only request checks no other field', async () => {
            const { app } = world({ definition: twoSecretsDefinition() });

            await call(app, 'POST', '/connection-types/mail/connections', {
                token: ADMIN_TOKEN,
                body: {
                    account: 'work',
                    settings: {},
                    secrets: { password: PASSWORD, token: 'other-secret' },
                },
            });

            const first = await call(app, 'PUT', '/connections/mail-work/config', {
                token: ADMIN_TOKEN,
                body: { secrets: { clear: ['password'] } },
            });
            const second = await call(app, 'PUT', '/connections/mail-work/config', {
                token: ADMIN_TOKEN,
                body: { secrets: { clear: ['token'] } },
            });

            expect(first.status).toBe(200);
            expect(second.status).toBe(200);
            expect((await json(second)).state).toBe('not_configured');
        });

        it('keeps the required checks on a save that also carries settings', async () => {
            const { app } = world();

            await call(app, 'POST', '/connection-types/mail/connections', {
                token: ADMIN_TOKEN,
                body: {
                    account: 'work',
                    settings: { host: 'imap' },
                    secrets: { password: PASSWORD },
                },
            });

            const response = await call(app, 'PUT', '/connections/mail-work/config', {
                token: ADMIN_TOKEN,
                body: { settings: {}, secrets: { clear: ['password'] } },
            });

            expect(response.status).toBe(400);
            expect((await json(response)).issues[0]).toMatchObject({ path: ['settings', 'host'] });
        });
    });

    it('carries multiline in GET /connection-types', async () => {
        const base = mailDefinition();
        const definition = { ...base, fields: base.fields.map((field) => (field.key === 'password' ? { ...field, multiline: true } : field)) };
        const { app } = world({ definition });
        const [type] = (await json(await call(app, 'GET', '/connection-types', { token: tokenFor() }))).data;

        expect(type.fields[2]).toMatchObject({ key: 'password', multiline: true });
        expect(type.fields[0]).not.toHaveProperty('multiline');
    });

    describe('listing', () => {
        it('lists a declared connection with no handle', async () => {
            const { app } = world({ declared: (definition) => [declare(definition, 'mail-work', {}, { account: 'work' })] });

            const response = await call(app, 'GET', '/connections', { token: tokenFor('connection:mail-work:read') });

            expect(response.status).toBe(200);
            expect((await json(response)).data).toEqual([{
                name: 'mail-work',
                type: 'mail',
                status: 'disconnected',
                live: false,
                account: 'work',
                state: 'not_configured',
                editable: true,
                deletable: false,
            }]);
        });

        it('hides a declared connection from a principal without read', async () => {
            const { app } = world({ declared: (definition) => [declare(definition, 'mail-work')] });

            const response = await call(app, 'GET', '/connections', { token: tokenFor('connection:other:read') });

            expect((await json(response)).data).toEqual([]);
        });

        it('lists an account created after the start', async () => {
            const { app, real } = world();

            await real.create('mail-new', 'mail', { settings: { host: 'h' } });

            const response = await call(app, 'GET', '/connections', { token: ADMIN_TOKEN });

            expect((await json(response)).data).toEqual([expect.objectContaining({
                name: 'mail-new',
                type: 'mail',
                account: 'new',
                editable: true,
                deletable: true,
            })]);
        });

        it('lists the types without their functions', async () => {
            const { app } = world();

            const response = await call(app, 'GET', '/connection-types', { token: tokenFor() });
            const [type] = (await json(response)).data;

            expect(response.status).toBe(200);
            expect(type).toMatchObject({
                type: 'mail',
                label: 'Mail',
                multiple: true,
                creatable: true,
                testable: false,
            });
            expect(type.fields[2]).toEqual({
                key: 'password',
                label: 'Password',
                kind: 'secret',
                required: true,
            });
        });

        it('lists types read-only on a store without connections', async () => {
            const { app } = world({ noConfigs: true });

            const [type] = (await json(await call(app, 'GET', '/connection-types', { token: tokenFor() }))).data;

            expect(type.creatable).toBe(false);
        });

        it('needs a principal for the types and the pages', async () => {
            const { app } = world();

            expect((await call(app, 'GET', '/connection-types')).status).toBe(401);
            expect((await call(app, 'GET', '/ui-pages')).status).toBe(401);
        });
    });

    describe('the config view', () => {
        it('reports sources, never an env value', async () => {
            const { app, real } = world({ declared: (definition) => [declare(definition, 'mail-work', { MAIL_HOST: 'env-host.example', MAIL_PASSWORD: PASSWORD }, { loadedRevision: 1 })] });

            await real.create('mail-work', 'mail', { settings: { port: 993, host: 'stored-host' } });

            const response = await call(app, 'GET', '/connections/mail-work/config', { token: tokenFor('connection:mail-work:read') });
            const body = await response.text();

            expect(response.status).toBe(200);
            expect(response.headers.get('cache-control')).toBe('private, no-store');
            expect(body).not.toContain('env-host.example');
            expect(body).not.toContain(PASSWORD);
            expect(JSON.parse(body)).toEqual({
                type: 'mail',
                state: 'configured',
                settings: { port: 993 },
                fields: [
                    { key: 'host', source: { kind: 'env', variable: 'MAIL_HOST' } },
                    { key: 'port', source: { kind: 'store' } },
                    {
                        key: 'password',
                        source: { kind: 'env', variable: 'MAIL_PASSWORD' },
                        set: true,
                    },
                ],
                restartRequired: false,
                editable: true,
                deletable: false,
            });
        });

        it('answers 404 for an unknown connection and 403 without read', async () => {
            const { app } = world({ declared: (definition) => [declare(definition, 'mail-work')] });
            const reader = tokenFor('run:read');

            expect((await call(app, 'GET', '/connections/nope/config', { token: ADMIN_TOKEN })).status).toBe(404);
            expect((await call(app, 'GET', '/connections/mail-work/config', { token: reader })).status).toBe(403);
            // the same answer whether or not it exists: a name is not probed
            expect((await call(app, 'GET', '/connections/nope/config', { token: reader })).status).toBe(403);
            expect((await call(app, 'GET', '/connections/NOT_VALID/config', { token: reader })).status).toBe(403);
        });

        it('answers 403 before any lookup on the write routes', async () => {
            const { app } = world();
            const reader = tokenFor('connection:nope:read');

            expect((await call(app, 'PUT', '/connections/nope/config', { token: reader, body: {} })).status).toBe(403);
            expect((await call(app, 'DELETE', '/connections/nope', { token: reader })).status).toBe(403);
            expect((await call(app, 'POST', '/connections/nope/test', { token: reader })).status).toBe(403);
            expect((await call(app, 'PUT', '/connections/nope/config', { token: tokenFor('connection:nope:write'), body: {} })).status).toBe(404);
        });

        it('stays readable on a store without connections', async () => {
            const { app } = world({ noConfigs: true, declared: (definition) => [declare(definition, 'mail-work')] });

            const view = await json(await call(app, 'GET', '/connections/mail-work/config', { token: ADMIN_TOKEN }));

            expect(view).toMatchObject({
                state: 'not_configured',
                editable: false,
                deletable: false,
            });
        });
    });

    describe('saving', () => {
        function saveBody(overrides: Record<string, unknown> = {}) {
            return {
                settings: { host: 'imap.example', port: 993 },
                secrets: { set: { password: PASSWORD } },
                ...overrides,
            };
        }

        it('never returns a secret, on success and on a failed save', async () => {
            const { app, errors } = world({ declared: (definition) => [declare(definition, 'mail-work')] });

            const saved = await call(app, 'PUT', '/connections/mail-work/config', { token: ADMIN_TOKEN, body: saveBody() });
            const savedBody = await saved.text();

            expect(saved.status).toBe(200);
            expect(savedBody).not.toContain(PASSWORD);

            const failures = await Promise.all([
                // a secret in the wrong place, of the wrong type and under an unknown field
                call(app, 'PUT', '/connections/mail-work/config', { token: ADMIN_TOKEN, body: saveBody({ settings: { host: 'h', password: PASSWORD } }) }),
                call(app, 'PUT', '/connections/mail-work/config', { token: ADMIN_TOKEN, body: saveBody({ secrets: { set: { password: [PASSWORD] } } }) }),
                call(app, 'PUT', '/connections/mail-work/config', { token: ADMIN_TOKEN, body: saveBody({ secrets: { set: { host: PASSWORD } } }) }),
                call(app, 'PUT', '/connections/mail-work/config', { token: ADMIN_TOKEN, body: saveBody({ secrets: PASSWORD }) }),
                call(app, 'PUT', '/connections/mail-work/config', { token: ADMIN_TOKEN, body: saveBody({ settings: { host: `${PASSWORD}\0` } }) }),
            ]);

            for (const failure of failures) {
                expect(failure.status).toBe(400);
                expect(await failure.text()).not.toContain(PASSWORD);
            }

            expect(JSON.stringify(errors.map(String))).not.toContain(PASSWORD);
        });

        it('keeps the secret out of a failed store write and onError', async () => {
            const { app, errors } = world({
                declared: (definition) => [declare(definition, 'mail-work')],
                configs: (real) => ({
                    ...real,
                    create: async () => {
                        throw new Error('store down');
                    },
                }),
            });

            const response = await call(app, 'PUT', '/connections/mail-work/config', { token: ADMIN_TOKEN, body: saveBody() });

            expect(response.status).toBe(500);
            expect(await response.text()).not.toContain(PASSWORD);
            expect(JSON.stringify(errors.map(String))).not.toContain(PASSWORD);
            expect(errors).toHaveLength(1);
        });

        it('a locked env field refuses a write', async () => {
            const { app, store } = world({ declared: (definition) => [declare(definition, 'mail-work', { MAIL_HOST: 'env-host.example', MAIL_PASSWORD: 'x' })] });

            const settings = await call(app, 'PUT', '/connections/mail-work/config', {
                token: ADMIN_TOKEN,
                body: { settings: { host: 'other' } },
            });
            const secret = await call(app, 'PUT', '/connections/mail-work/config', {
                token: ADMIN_TOKEN,
                body: { secrets: { set: { password: PASSWORD } } },
            });
            const clear = await call(app, 'PUT', '/connections/mail-work/config', {
                token: ADMIN_TOKEN,
                body: { secrets: { clear: ['password'] } },
            });

            expect(settings.status).toBe(400);
            expect((await json(settings)).issues[0]).toMatchObject({ path: ['settings', 'host'], message: expect.stringContaining('MAIL_HOST') });
            expect(secret.status).toBe(400);
            expect(clear.status).toBe(400);
            expect(await store.connections!.findOne('mail-work')).toBeUndefined();
        });

        it('requires connection:<name>:write to save', async () => {
            const { app } = world({ declared: (definition) => [declare(definition, 'mail-work')] });

            const read = await call(app, 'PUT', '/connections/mail-work/config', {
                token: tokenFor('connection:mail-work:read'),
                body: saveBody(),
            });
            const write = await call(app, 'PUT', '/connections/mail-work/config', {
                token: tokenFor('connection:mail-work:write'),
                body: saveBody(),
            });

            expect(read.status).toBe(403);
            expect(write.status).toBe(200);
        });

        it('creates the row of a declared connection on the first save, with the provider type', async () => {
            const { app, store } = world({ declared: (definition) => [declare(definition, 'mail-work')] });

            await call(app, 'PUT', '/connections/mail-work/config', { token: ADMIN_TOKEN, body: saveBody() });

            expect(await store.connections!.findOne('mail-work')).toMatchObject({ type: 'mail' });
        });

        it('a save missing a required field not in env is 400', async () => {
            const { app } = world({ declared: (definition) => [declare(definition, 'mail-work')] });

            const response = await call(app, 'PUT', '/connections/mail-work/config', {
                token: ADMIN_TOKEN,
                body: { settings: { port: 1 }, secrets: { set: { password: PASSWORD } } },
            });

            expect(response.status).toBe(400);
            expect((await json(response)).issues[0].path).toEqual(['settings', 'host']);
        });

        it('treats an empty form value as unset', async () => {
            const { app, real } = world({ declared: (definition) => [declare(definition, 'mail-work')] });

            const missing = await call(app, 'PUT', '/connections/mail-work/config', {
                token: ADMIN_TOKEN,
                body: { settings: { host: '', port: '' }, secrets: { set: { password: PASSWORD } } },
            });
            const saved = await call(app, 'PUT', '/connections/mail-work/config', {
                token: ADMIN_TOKEN,
                body: { settings: { host: 'h', port: '' }, secrets: { set: { password: PASSWORD } } },
            });

            expect(missing.status).toBe(400);
            expect(saved.status).toBe(200);
            expect((await real.describe('mail-work'))?.settings).toEqual({ host: 'h' });

            // an untouched secret input keeps the stored value
            const again = await call(app, 'PUT', '/connections/mail-work/config', {
                token: ADMIN_TOKEN,
                body: { settings: { host: 'h' }, secrets: { set: { password: '' } } },
            });

            expect(again.status).toBe(200);
            expect((await real.read('mail-work'))?.values.password).toBe(PASSWORD);
        });

        it('refuses a value of the wrong kind without echoing it', async () => {
            const { app } = world({ declared: (definition) => [declare(definition, 'mail-work')] });

            const response = await call(app, 'PUT', '/connections/mail-work/config', {
                token: ADMIN_TOKEN,
                body: saveBody({ settings: { host: 'h', port: 'not-a-port-value' } }),
            });

            expect(response.status).toBe(400);
            expect(await response.text()).not.toContain('not-a-port-value');
        });

        it('clearing a required secret is accepted and reports incomplete', async () => {
            const { app } = world({ declared: (definition) => [declare(definition, 'mail-work')] });

            await call(app, 'PUT', '/connections/mail-work/config', { token: ADMIN_TOKEN, body: saveBody() });

            const response = await call(app, 'PUT', '/connections/mail-work/config', {
                token: ADMIN_TOKEN,
                body: { secrets: { clear: ['password'] } },
            });
            const view = await json(response);

            expect(response.status).toBe(200);
            expect(view.state).toBe('incomplete');
            expect(view.fields[2]).toEqual({
                key: 'password',
                source: { kind: 'unset' },
                set: false,
            });
        });

        it('restartRequired flips after save', async () => {
            const { app, real } = world({ declared: (definition) => [declare(definition, 'mail-work', {}, { loadedRevision: 1 })] });

            await real.create('mail-work', 'mail', { settings: { host: 'h' }, secrets: { set: { password: PASSWORD } } });

            const before = await json(await call(app, 'GET', '/connections/mail-work/config', { token: ADMIN_TOKEN }));
            const after = await json(await call(app, 'PUT', '/connections/mail-work/config', { token: ADMIN_TOKEN, body: saveBody() }));

            expect(before.restartRequired).toBe(false);
            expect(after.restartRequired).toBe(true);
        });

        it('restartRequired is true once the loaded account was deleted and created again', async () => {
            const {
                app, 
                real, 
                clock, 
            } = world({
                declared: (definition) => [declare(definition, 'mail-work', {}, {
                    account: 'work',
                    deletable: true,
                    loadedRevision: 1,
                    loadedCreatedAt: new Date(1_000_000),
                })],
            });

            await real.create('mail-work', 'mail', { settings: { host: 'h' }, secrets: { set: { password: PASSWORD } } });

            const before = await json(await call(app, 'GET', '/connections/mail-work/config', { token: ADMIN_TOKEN }));

            expect(before.restartRequired).toBe(false);

            const deleted = await call(app, 'DELETE', '/connections/mail-work', { token: ADMIN_TOKEN });

            expect(deleted.status).toBe(200);
            clock.advance(5_000);

            const created = await call(app, 'POST', '/connection-types/mail/connections', {
                token: ADMIN_TOKEN,
                body: {
                    account: 'work',
                    settings: { host: 'h' },
                    secrets: { password: PASSWORD },
                },
            });

            expect(created.status).toBe(201);

            const after = await json(await call(app, 'GET', '/connections/mail-work/config', { token: ADMIN_TOKEN }));

            expect(after.restartRequired).toBe(true);
        });

        it('does not ask for a restart of a pinned connection with a leftover row', async () => {
            const { app, real } = world({ declared: (definition) => [declare(definition, 'mail-work', {}, { editable: false })] });

            await real.create('mail-work', 'mail', { settings: { host: 'h' } });

            const view = await json(await call(app, 'GET', '/connections/mail-work/config', { token: ADMIN_TOKEN }));

            expect(view.restartRequired).toBe(false);
        });

        it('refuses a connection that is not editable', async () => {
            const { app } = world({ declared: (definition) => [declare(definition, 'mail-work', {}, { editable: false })] });

            const response = await call(app, 'PUT', '/connections/mail-work/config', { token: ADMIN_TOKEN, body: saveBody() });

            expect(response.status).toBe(409);
        });

        it('a stale key answers 409', async () => {
            const { app, real } = world({
                declared: (definition) => [declare(definition, 'mail-work')],
                configs: (store) => ({
                    ...store,
                    update: async (name) => {
                        throw new ConnectionChangedError(name);
                    },
                }),
            });

            await real.create('mail-work', 'mail', { settings: { host: 'h' } });

            const response = await call(app, 'PUT', '/connections/mail-work/config', { token: ADMIN_TOKEN, body: saveBody() });

            expect(response.status).toBe(409);
            expect((await json(response)).code).toBe('connection_changed');
        });

        it('names the variable when a save needs the missing keyring', async () => {
            const { app } = world({
                declared: (definition) => [declare(definition, 'mail-work')],
                keyring: () => {
                    throw new InvalidAgentDefinitionError('CHAMVI_ENCRYPTION_KEYS is not set.');
                },
            });

            const response = await call(app, 'PUT', '/connections/mail-work/config', { token: ADMIN_TOKEN, body: saveBody() });

            expect(response.status).toBe(409);
            expect((await json(response)).message).toContain('CHAMVI_ENCRYPTION_KEYS');
        });

        it('answers no save on a store without connections', async () => {
            const { app } = world({ noConfigs: true, declared: (definition) => [declare(definition, 'mail-work')] });

            const response = await call(app, 'PUT', '/connections/mail-work/config', { token: ADMIN_TOKEN, body: saveBody() });

            expect(response.status).toBe(409);
        });
    });

    describe('creating', () => {
        const body = {
            account: 'work',
            settings: { host: 'imap.example' },
            secrets: { password: PASSWORD },
        };

        function create(app: ReturnType<typeof world>['app'], token: string, payload: unknown = body) {
            return call(app, 'POST', '/connection-types/mail/connections', { token, body: payload });
        }

        it('connection:* cannot create', async () => {
            const { app } = world();

            const response = await create(app, tokenFor('connection:*'));

            expect(response.status).toBe(403);
        });

        it('connections:create can', async () => {
            const {
                app,
                store,
                real,
            } = world();

            const response = await create(app, tokenFor(CREATE));
            const text = await response.text();

            expect(response.status).toBe(201);
            expect(text).not.toContain(PASSWORD);
            expect(JSON.parse(text)).toMatchObject({
                type: 'mail',
                name: 'mail-work',
                state: 'configured',
                restartRequired: true,
                deletable: true,
            });
            expect(await store.connections!.findOne('mail-work')).toMatchObject({ type: 'mail' });
            expect((await real.read('mail-work'))?.values).toEqual({ host: 'imap.example', password: PASSWORD });
        });

        it('never echoes a refused account', async () => {
            const { app } = world();

            for (const account of [[PASSWORD], `${PASSWORD}\0`, PASSWORD.repeat(4)]) {
                const response = await create(app, tokenFor(CREATE), { ...body, account });

                expect(response.status).toBe(400);
                expect(await response.text()).not.toContain(PASSWORD);
            }
        });

        it('a duplicate uniqueId is 409', async () => {
            const { app, real } = world();

            await real.create('mail-a', 'mail', { settings: { host: 'imap.example' } });

            const response = await create(app, tokenFor(CREATE));

            expect(response.status).toBe(409);
        });

        it('a duplicate uniqueId of a declared connection is 409', async () => {
            const { app } = world({ declared: (definition) => [declare(definition, 'mail-env', { MAIL_HOST: 'imap.example', MAIL_PASSWORD: 'x' })] });

            const response = await create(app, tokenFor(CREATE));

            expect(response.status).toBe(409);
        });

        it('multiple:false refuses create', async () => {
            const { app, store } = world({ definition: mailDefinition({ multiple: false }) });

            const response = await create(app, tokenFor(CREATE));

            expect(response.status).toBe(409);
            expect(await store.connections!.findOne('mail-work')).toBeUndefined();
        });

        it('refuses a type that is not creatable and a store without connections', async () => {
            const pinned = world({ creatable: false });
            const noStore = world({ noConfigs: true });

            expect((await create(pinned.app, tokenFor(CREATE))).status).toBe(409);
            expect((await create(noStore.app, tokenFor(CREATE))).status).toBe(409);
        });

        it('answers 404 for an unknown type', async () => {
            const { app } = world();

            const response = await call(app, 'POST', '/connection-types/nope/connections', { token: tokenFor(CREATE), body });

            expect(response.status).toBe(404);
        });

        it('a taken name is 409', async () => {
            const { app, real } = world();

            await real.create('mail-work', 'mail', { settings: { host: 'other' } });

            expect((await create(app, tokenFor(CREATE))).status).toBe(409);
        });

        it('an account clashing with a declared name is 409', async () => {
            const { app } = world({ declared: (definition) => [declare(definition, 'mail-work')] });

            expect((await create(app, tokenFor(CREATE))).status).toBe(409);
        });

        it('repairs a row a crashed create left without config', async () => {
            const {
                app,
                store,
                real,
            } = world();

            await real.create('mail-work', 'mail', {});

            const response = await create(app, tokenFor(CREATE));

            expect(response.status).toBe(201);
            expect((await real.read('mail-work'))?.values.password).toBe(PASSWORD);
            expect((await store.connections!.findConfig('mail-work'))?.revision).toBe(1);
        });

        it('refuses to repair a bare row of another type', async () => {
            const { app, real } = world();

            await real.create('mail-work', 'whatsapp', {});

            expect((await create(app, tokenFor(CREATE))).status).toBe(409);
        });

        it('refuses an invalid account and a missing required field', async () => {
            const { app } = world();

            expect((await create(app, tokenFor(CREATE), { ...body, account: 'NOT VALID' })).status).toBe(400);
            expect((await create(app, tokenFor(CREATE), { account: 'work', settings: { host: 'h' } })).status).toBe(400);
            expect((await create(app, tokenFor(CREATE), { ...body, account: 'x'.repeat(64) })).status).toBe(400);
        });
    });

    describe('state in the listing and the view', () => {
        // the start resolved the revision it loaded: the host alone, no password
        const declareIncomplete = (definition: ConnectionTypeDefinition) => [declare(definition, 'mail-work', {}, {
            account: 'work',
            loadedRevision: 1,
            resolved: resolveConnection({
                definition,
                name: 'mail-work',
                readVariable: () => undefined,
                stored: { host: 'h' },
            }),
        })];

        it('reports an incomplete connection and the labels it lacks', async () => {
            const { app, real } = world({ declared: declareIncomplete });

            await real.create('mail-work', 'mail', { settings: { host: 'h' } });

            const list = await json(await call(app, 'GET', '/connections', { token: ADMIN_TOKEN }));
            const view = await json(await call(app, 'GET', '/connections/mail-work/config', { token: ADMIN_TOKEN }));

            expect(list.data[0]).toMatchObject({
                state: 'incomplete',
                missing: ['Password'],
                live: false,
            });
            expect(view).toMatchObject({ state: 'incomplete', missing: ['Password'] });
        });

        it('reports the state of an account created after the start', async () => {
            const { app, real } = world();

            await real.create('mail-late', 'mail', { settings: { host: 'h' }, secrets: { set: { password: PASSWORD } } });

            expect((await json(await call(app, 'GET', '/connections', { token: ADMIN_TOKEN }))).data[0]).toMatchObject({
                name: 'mail-late',
                state: 'configured',
                live: false,
            });
        });

        it('says why the last start could not use a complete connection, until a save waits for a restart', async () => {
            const declared = (definition: ConnectionTypeDefinition) => {
                const entry = declare(definition, 'mail-work', {}, { loadedRevision: 1 });

                entry.resolved = {
                    ...entry.resolved,
                    state: 'incomplete',
                    reason: 'approvalUrl is required, or CHAMVI_PUBLIC_URL.',
                };

                return [entry];
            };
            const { app, real } = world({ declared });

            await real.create('mail-work', 'mail', { settings: { host: 'h' }, secrets: { set: { password: PASSWORD } } });

            const view = await json(await call(app, 'GET', '/connections/mail-work/config', { token: ADMIN_TOKEN }));
            const list = await json(await call(app, 'GET', '/connections', { token: ADMIN_TOKEN }));
            const detail = await json(await call(app, 'GET', '/connections/mail-work', { token: tokenFor('connection:mail-work:read') }));

            expect(view).toMatchObject({ state: 'incomplete', reason: 'approvalUrl is required, or CHAMVI_PUBLIC_URL.' });
            expect(list.data[0].reason).toBe(view.reason);
            expect(detail).toMatchObject({ state: 'incomplete', reason: view.reason });

            await real.update('mail-work', { settings: { host: 'h2' } });

            const after = await json(await call(app, 'GET', '/connections/mail-work/config', { token: ADMIN_TOKEN }));

            expect(after.state).toBe('configured');
            expect(after.reason).toBeUndefined();
        });

        it('joins a live handle with its configuration', async () => {
            const definition = mailDefinition();
            const clock = new ControllableClock(new Date(1_000_000));
            const store = createMemoryStore({ clock });
            const connection = declare(definition, 'mail-work', { MAIL_HOST: 'h', MAIL_PASSWORD: 'p' });
            const { app } = createTestApp({
                store,
                clock,
                connections: () => [{
                    name: 'mail-work',
                    type: 'mail',
                    status: () => 'connected',
                    widgets: () => [],
                    subscribe: () => () => undefined,
                    actions: {},
                }],
                connectionTypes: () => [{
                    definition,
                    creatable: () => false,
                    connections: () => [connection],
                }],
            });

            const list = await json(await call(app, 'GET', '/connections', { token: ADMIN_TOKEN }));

            expect(list.data[0].status).toBe('connected');
            expect(list.data[0].live).toBeUndefined();
            expect(await json(await call(app, 'GET', '/connections/mail-work', { token: ADMIN_TOKEN }))).toMatchObject({
                status: 'connected',
                state: 'configured',
                live: true,
            });
        });
    });

    describe('identity on save', () => {
        const worldOfTwo = async () => {
            const context = world({ declared: (definition) => [declare(definition, 'mail-a', {}, { deletable: true })] });

            await context.real.create('mail-a', 'mail', { settings: { host: 'a.test' }, secrets: { set: { password: PASSWORD } } });
            await context.real.create('mail-b', 'mail', { settings: { host: 'b.test' }, secrets: { set: { password: PASSWORD } } });

            return context;
        };

        it('refuses editing an account to the identity of another with 409', async () => {
            const { app, real } = await worldOfTwo();

            const response = await call(app, 'PUT', '/connections/mail-b/config', {
                token: ADMIN_TOKEN,
                body: { settings: { host: 'a.test' }, secrets: { set: { password: PASSWORD } } },
            });

            expect(response.status).toBe(409);
            expect((await real.describe('mail-b'))?.settings).toEqual({ host: 'b.test' });
        });

        it('compares against what is stored now, not the last start', async () => {
            const { app, real } = await worldOfTwo();

            await real.update('mail-a', { settings: { host: 'moved.test' } });

            const taken = await call(app, 'PUT', '/connections/mail-b/config', {
                token: ADMIN_TOKEN,
                body: { settings: { host: 'moved.test' }, secrets: { set: { password: PASSWORD } } },
            });
            const freed = await call(app, 'PUT', '/connections/mail-b/config', {
                token: ADMIN_TOKEN,
                body: { settings: { host: 'a.test' }, secrets: { set: { password: PASSWORD } } },
            });

            expect(taken.status).toBe(409);
            expect(freed.status).toBe(200);
        });

        it('lets an account keep its own identity', async () => {
            const { app } = await worldOfTwo();

            const response = await call(app, 'PUT', '/connections/mail-b/config', {
                token: ADMIN_TOKEN,
                body: { settings: { host: 'b.test', port: 1 } },
            });

            expect(response.status).toBe(200);
        });
    });

    describe('fields that decide where a secret goes', () => {
        function boundDefinition(overrides: Partial<ConnectionTypeDefinition> = {}): ConnectionTypeDefinition {
            return mailDefinition({
                uniqueId: undefined,
                fields: [
                    {
                        key: 'host',
                        label: 'Host',
                        kind: 'string',
                        required: true,
                        bindsSecrets: true,
                    },
                    {
                        key: 'port',
                        label: 'Port',
                        kind: 'number',
                    },
                    {
                        key: 'password',
                        label: 'Password',
                        kind: 'secret',
                        required: true,
                        env: () => 'MAIL_PASSWORD',
                    },
                    {
                        key: 'token',
                        label: 'Token',
                        kind: 'secret',
                    },
                ],
                ...overrides,
            });
        }

        const saved = async (env: Record<string, string> = {}) => {
            const context = world({
                definition: boundDefinition(),
                declared: (definition) => [declare(definition, 'mail-work', {}, {
                    resolved: resolveConnection({
                        definition,
                        name: 'mail-work',
                        readVariable: (variable) => env[variable],
                        stored: { host: 'old.test' },
                    }),
                })],
            });

            await context.real.create('mail-work', 'mail', {
                settings: { host: 'old.test' },
                secrets: { set: { password: PASSWORD, token: 'second-secret' } },
            });

            return context;
        };

        it('carries bindsSecrets in GET /connection-types', async () => {
            const { app } = world({ definition: boundDefinition() });
            const body = await json(await call(app, 'GET', '/connection-types', { token: ADMIN_TOKEN }));

            expect(body.data[0].fields[0].bindsSecrets).toBe(true);
        });

        it('refuses moving the field without every stored secret, naming each, and stores nothing', async () => {
            const { app, real } = await saved();

            const response = await call(app, 'PUT', '/connections/mail-work/config', {
                token: ADMIN_TOKEN,
                body: { settings: { host: 'new.test' }, secrets: { set: { password: 'typed-again' } } },
            });
            const text = await response.text();

            expect(response.status).toBe(400);
            expect(JSON.stringify(JSON.parse(text))).toContain('token');
            expect(text).not.toContain('typed-again');
            expect(text).not.toContain('new.test');
            expect((await real.describe('mail-work'))?.settings).toEqual({ host: 'old.test' });
        });

        it('accepts the move with every secret re-entered, or a secret cleared', async () => {
            const { app, real } = await saved();

            const response = await call(app, 'PUT', '/connections/mail-work/config', {
                token: ADMIN_TOKEN,
                body: { settings: { host: 'new.test' }, secrets: { set: { password: 'typed-again' }, clear: ['token'] } },
            });

            expect(response.status).toBe(200);
            expect(await real.describe('mail-work')).toMatchObject({ settings: { host: 'new.test' }, secretsSet: ['password'] });
        });

        it('leaves other edits alone, and a save that keeps the value', async () => {
            const { app } = await saved();

            const response = await call(app, 'PUT', '/connections/mail-work/config', {
                token: ADMIN_TOKEN,
                body: { settings: { host: 'old.test', port: 2 } },
            });

            expect(response.status).toBe(200);
        });

        it('counts setting a field that had no value as moving it', async () => {
            const definition = boundDefinition();
            const context = world({
                definition: {
                    ...definition,
                    fields: definition.fields.map((field) => (field.key === 'host' ? { ...field, required: false } : field)),
                },
                declared: (types) => [declare(types, 'mail-work')],
            });

            await context.real.create('mail-work', 'mail', { settings: {}, secrets: { set: { password: PASSWORD } } });

            const response = await call(context.app, 'PUT', '/connections/mail-work/config', {
                token: ADMIN_TOKEN,
                body: { settings: { host: 'evil.test' } },
            });

            expect(response.status).toBe(400);
        });

        it('refuses the move with 409 for a secret from env, naming the field and never the value', async () => {
            const { app, real } = await saved({ MAIL_PASSWORD: 'env-secret-value' });

            const response = await call(app, 'PUT', '/connections/mail-work/config', {
                token: ADMIN_TOKEN,
                body: { settings: { host: 'new.test' }, secrets: { set: { token: 'typed-again' } } },
            });
            const text = await response.text();

            expect(response.status).toBe(409);
            expect(text).toContain('Host');
            expect(text).toContain('MAIL_PASSWORD');
            expect(text).not.toContain('env-secret-value');
            expect(text).not.toContain('typed-again');
            expect((await real.describe('mail-work'))?.settings).toEqual({ host: 'old.test' });
        });
    });

    describe('testing', () => {
        it('ends a test that never answers at its deadline, aborting its signal', async () => {
            let seen: AbortSignal | undefined;
            const {
                app,
                real,
                clock,
            } = world({
                definition: mailDefinition({
                    test: (_values, signal) => {
                        seen = signal;

                        return Promise.withResolvers<void>().promise;
                    },
                }),
                declared: (definition) => [declare(definition, 'mail-work')],
            });

            await real.create('mail-work', 'mail', { settings: { host: 'h' }, secrets: { set: { password: PASSWORD } } });

            const pending = call(app, 'POST', '/connections/mail-work/test', { token: ADMIN_TOKEN });

            await vi.waitFor(() => expect(seen).toBeDefined());
            clock.advance(30_000);

            expect(await json(await pending)).toEqual({ ok: false, message: 'The connection test timed out.' });
            expect(seen?.aborted).toBe(true);
        });

        it('test runs saved values only', async () => {
            const test = vi.fn(async () => undefined);
            const { app, real } = world({
                definition: mailDefinition({ test }),
                declared: (definition) => [declare(definition, 'mail-work')],
            });

            await real.create('mail-work', 'mail', { settings: { host: 'saved-host' }, secrets: { set: { password: PASSWORD } } });

            const response = await call(app, 'POST', '/connections/mail-work/test', {
                token: tokenFor('connection:mail-work:write'),
                body: { settings: { host: 'unsaved-host' } },
            });

            expect(response.status).toBe(200);
            expect(await json(response)).toEqual({ ok: true });
            expect(test).toHaveBeenCalledTimes(1);
            expect((test.mock.calls[0] as unknown as [ConnectionValues])[0]).toEqual({ host: 'saved-host', password: PASSWORD });
        });

        it('lets an env value win over a saved one', async () => {
            const test = vi.fn(async () => undefined);
            const { app, real } = world({
                definition: mailDefinition({ test }),
                declared: (definition) => [declare(definition, 'mail-work', { MAIL_HOST: 'env-host', MAIL_PASSWORD: 'env-secret' })],
            });

            await real.create('mail-work', 'mail', { settings: { host: 'saved-host', port: 1 } });

            await call(app, 'POST', '/connections/mail-work/test', { token: ADMIN_TOKEN });

            expect((test.mock.calls[0] as unknown as [ConnectionValues])[0]).toEqual({
                host: 'env-host',
                port: 1,
                password: 'env-secret',
            });
        });

        it('reports a failed test without the secret', async () => {
            const {
                app,
                real,
                errors,
            } = world({
                definition: mailDefinition({
                    test: async (values) => {
                        throw new InvalidAgentDefinitionError(`login failed for ${String(values.password)}`);
                    },
                }),
                declared: (definition) => [declare(definition, 'mail-work')],
            });

            await real.create('mail-work', 'mail', { settings: { host: 'h' }, secrets: { set: { password: PASSWORD } } });

            const response = await call(app, 'POST', '/connections/mail-work/test', { token: ADMIN_TOKEN });
            const text = await response.text();

            expect(response.status).toBe(200);
            expect(text).not.toContain(PASSWORD);
            expect(JSON.parse(text).ok).toBe(false);
            expect(errors).toEqual([]);
        });

        it('hides the message of an error it does not know', async () => {
            const { app, real } = world({
                definition: mailDefinition({
                    test: async () => {
                        throw new Error('raw driver detail');
                    },
                }),
                declared: (definition) => [declare(definition, 'mail-work')],
            });

            await real.create('mail-work', 'mail', { settings: { host: 'h' }, secrets: { set: { password: PASSWORD } } });

            const response = await call(app, 'POST', '/connections/mail-work/test', { token: ADMIN_TOKEN });

            expect(await response.text()).not.toContain('raw driver detail');
        });

        it('says a connection set in code cannot be tested instead of asking to save it', async () => {
            const { app } = world({
                definition: mailDefinition({ test: async () => undefined }),
                declared: (types) => [declare(types, 'mail-work', {}, { editable: false })],
            });

            const response = await call(app, 'POST', '/connections/mail-work/test', { token: ADMIN_TOKEN });

            expect(response.status).toBe(409);
            expect(await response.text()).toContain('cannot be tested here');
        });

        it('needs write, a test and complete values', async () => {
            const definition = mailDefinition({ test: async () => undefined });
            const { app } = world({
                definition,
                declared: (types) => [declare(types, 'mail-work')],
            });
            const without = world({ declared: (types) => [declare(types, 'mail-work')] });

            expect((await call(app, 'POST', '/connections/mail-work/test', { token: tokenFor('connection:mail-work:read') })).status).toBe(403);
            expect((await call(app, 'POST', '/connections/mail-work/test', { token: ADMIN_TOKEN })).status).toBe(409);
            expect((await call(without.app, 'POST', '/connections/mail-work/test', { token: ADMIN_TOKEN })).status).toBe(404);
        });
    });

    describe('deleting', () => {
        it('delete is refused for module-declared and env-declared connections', async () => {
            const {
                app,
                store,
                real,
            } = world({
                declared: (definition) => [
                    declare(definition, 'mail-module'),
                    declare(definition, 'mail-env', { MAIL_HOST: 'h', MAIL_PASSWORD: 'x' }),
                ],
            });

            await real.create('mail-module', 'mail', { settings: { host: 'h' } });

            expect((await call(app, 'DELETE', '/connections/mail-module', { token: ADMIN_TOKEN })).status).toBe(409);
            expect((await call(app, 'DELETE', '/connections/mail-env', { token: ADMIN_TOKEN })).status).toBe(409);
            expect(await store.connections!.findOne('mail-module')).toBeDefined();
        });

        it('deletes a stored account of a multi-instance type', async () => {
            const {
                app,
                store,
                real,
            } = world();

            await real.create('mail-work', 'mail', { settings: { host: 'h' } });

            expect((await call(app, 'DELETE', '/connections/mail-work', { token: tokenFor('connection:mail-work:read') })).status).toBe(403);

            const response = await call(app, 'DELETE', '/connections/mail-work', { token: tokenFor('connection:mail-work:write') });

            expect(response.status).toBe(200);
            expect(await store.connections!.findOne('mail-work')).toBeUndefined();
        });

        function deletableWorld() {
            return world({
                declared: (definition) => [declare(definition, 'mail-work', {}, {
                    account: 'work',
                    deletable: true,
                    loadedRevision: 1,
                    resolved: resolveConnection({
                        definition,
                        name: 'mail-work',
                        readVariable: () => undefined,
                        stored: { host: 'imap.example', password: 'x' },
                    }),
                })],
            });
        }

        const account = {
            account: 'work',
            settings: { host: 'imap.example' },
            secrets: { password: PASSWORD },
        };

        it('treats a deleted account as gone, not as the snapshot of the last start', async () => {
            const {
                app,
                real,
                store,
            } = deletableWorld();

            await real.create('mail-work', 'mail', { settings: { host: 'imap.example' }, secrets: { set: { password: PASSWORD } } });
            await call(app, 'DELETE', '/connections/mail-work', { token: ADMIN_TOKEN });

            const list = await json(await call(app, 'GET', '/connections', { token: ADMIN_TOKEN }));
            const put = await call(app, 'PUT', '/connections/mail-work/config', {
                token: ADMIN_TOKEN,
                body: { settings: { host: 'other' }, secrets: { set: { password: PASSWORD } } },
            });

            expect(list.data).toEqual([]);
            expect(put.status).toBe(404);
            expect(await store.connections!.findOne('mail-work')).toBeUndefined();
        });

        it('lets a just-deleted account and its identity be added again', async () => {
            const { app, real } = deletableWorld();

            await real.create('mail-work', 'mail', { settings: { host: 'imap.example' }, secrets: { set: { password: PASSWORD } } });
            await call(app, 'DELETE', '/connections/mail-work', { token: ADMIN_TOKEN });

            const response = await call(app, 'POST', '/connection-types/mail/connections', { token: tokenFor(CREATE), body: account });

            expect(response.status).toBe(201);
            expect((await json(response)).restartRequired).toBe(true);
        });

        it('lets the identity of a deleted account be added under another name', async () => {
            const { app, real } = deletableWorld();

            await real.create('mail-work', 'mail', { settings: { host: 'imap.example' }, secrets: { set: { password: PASSWORD } } });
            await call(app, 'DELETE', '/connections/mail-work', { token: ADMIN_TOKEN });

            const response = await call(app, 'POST', '/connection-types/mail/connections', {
                token: tokenFor(CREATE),
                body: { ...account, account: 'other' },
            });

            expect(response.status).toBe(201);
        });

        it('keeps a deletable connection declared while its row exists', async () => {
            const { app, real } = deletableWorld();

            await real.create('mail-work', 'mail', { settings: { host: 'imap.example' }, secrets: { set: { password: PASSWORD } } });

            const response = await call(app, 'POST', '/connection-types/mail/connections', { token: tokenFor(CREATE), body: account });

            expect(response.status).toBe(409);
        });

        it('a held connection answers 409', async () => {
            const {
                app,
                store,
                real,
            } = world();

            await real.create('mail-work', 'mail', { settings: { host: 'h' } });
            await store.locks.acquire('connection:mail-work', 'someone', 60_000);

            const response = await call(app, 'DELETE', '/connections/mail-work', { token: ADMIN_TOKEN });

            expect(response.status).toBe(409);
            expect((await json(response)).code).toBe('connection_held');
            expect(await store.connections!.findOne('mail-work')).toBeDefined();
        });
    });

    describe('ui pages', () => {
        const page = {
            slug: 'tool-mail',
            label: 'Mail',
            types: ['mail'],
            path: '/ui/ext/tool-mail',
        };

        it('lists the pages for any principal', async () => {
            const { app } = world({ uiPages: () => [page] });

            const response = await call(app, 'GET', '/ui-pages', { token: tokenFor() });

            expect(await json(response)).toEqual({ data: [page] });
        });

        it('prefixes the path with the app basePath', async () => {
            const { app } = world({ uiPages: () => [page], basePath: '/api' });

            const response = await call(app, 'GET', '/api/ui-pages', { token: tokenFor() });

            expect((await json(response)).data[0].path).toBe('/api/ui/ext/tool-mail');
        });

        it('lists no page by default', async () => {
            const { app } = world();

            expect(await json(await call(app, 'GET', '/ui-pages', { token: tokenFor() }))).toEqual({ data: [] });
        });
    });
});
