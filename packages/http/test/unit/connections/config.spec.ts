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
        declared,
        errors,
    };
}

async function json(response: Response): Promise<any> {
    return response.json();
}

describe('connection configuration', () => {
    describe('listing', () => {
        it('lists a declared connection with no handle', async () => {
            const { app } = world({ declared: (definition) => [declare(definition, 'mail-work', {}, { account: 'work' })] });

            const response = await call(app, 'GET', '/connections', { token: tokenFor('connection:mail-work:read') });

            expect(response.status).toBe(200);
            expect((await json(response)).data).toEqual([{
                name: 'mail-work',
                type: 'mail',
                status: 'disconnected',
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

            expect((await call(app, 'GET', '/connections/nope/config', { token: ADMIN_TOKEN })).status).toBe(404);
            expect((await call(app, 'GET', '/connections/mail-work/config', { token: tokenFor('run:read') })).status).toBe(403);
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

    describe('testing', () => {
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
