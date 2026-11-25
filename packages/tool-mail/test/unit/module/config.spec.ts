/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomBytes } from 'node:crypto';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import {
    ConnectionService,
    InvalidAgentDefinitionError,
    createConnectionConfigStore,
    createKeyring,
    defineModelAgent,
    systemClock,
} from '@chamvi/core';
import { MemoryConnectionRepository, MemoryRegistry } from '@chamvi/store-memory';
import type {
    Agent,
    DeclaredConnection,
    IConnectionTypeProvider,
} from '@chamvi/core';
import { createTestEngine, mockModel } from '@chamvi/test-kit';
import {
    AppToken,
    ModuleName,
    configModule,
    createLogger,
    engineModule,
} from '@chamvi/app';
import type { IModule, StoredConnection } from '@chamvi/app';
import { createModuleHarness, memoryStoreModule } from '@chamvi/app/testing';
import type { ModuleHarness, ModuleHarnessOptions } from '@chamvi/app/testing';
import { mailTools } from '@chamvi/tool-mail';
import type { MailAccountView } from '@chamvi/tool-mail';
import {
    MAIL_ACCOUNTS_VARIABLE,
    MAIL_CONNECTION_TYPE,
    TOOL_MAIL_MODULE_NAME,
    toolMailModule,
} from '@chamvi/tool-mail/module';
import type { ToolMailModuleOptions } from '@chamvi/tool-mail/module';
import { loadMailAccounts, mailConnectionDefinition } from '../../../src/module/type.ts';
import { createFakeImap } from '../../utils/imap.ts';
import type { FakeImap } from '../../utils/imap.ts';
import {
    PASSWORD,
    accountOf,
    fakeOptions,
    untagged,
} from '../../utils/mail.ts';

/**
 * The registry the app's memory repositories share with the spec, whether
 * the app keeps connections (`connections: false` keeps none) and a
 * connection service on that registry, to seed and read the rows the app sees.
 */
function storeOf(options: { connections?: boolean } = {}) {
    const registry = new MemoryRegistry();
    const connectionRepository = new MemoryConnectionRepository({ registry });

    return {
        registry,
        connections: options.connections !== false,
        connectionRepository,
        connectionService: new ConnectionService({ repository: connectionRepository, clock: systemClock }),
    };
}

type TestStore = ReturnType<typeof storeOf>;

/**
 * A module replacing the store module, as a third-party store would: the
 * memory store on the spec's registry with the spec's connection
 * repository (whose methods a spec replaces), or none.
 */
function storeModuleOf(store: TestStore): IModule {
    return {
        name: ModuleName.STORE,
        dependencies: [ModuleName.CONFIG],
        async setup(container) {
            await memoryStoreModule({ registry: store.registry, connections: false }).setup(container);

            if (store.connections) {
                container.register(AppToken.CONNECTION_REPOSITORY, { useValue: store.connectionRepository });
            }
        },
    };
}

const STORED_PASSWORD = 'stored-secret-password';

const keyring = createKeyring([{ id: 'k1', key: randomBytes(32) }]);

const harnesses: ModuleHarness[] = [];
const logLines: string[] = [];
const servers: FakeImap[] = [];

afterEach(async () => {
    logLines.length = 0;

    for (const harness of harnesses.splice(0)) {
        await harness.stop();
    }

    for (const server of servers.splice(0)) {
        await server.close();
    }
});

async function fake(): Promise<FakeImap> {
    const server = await createFakeImap(fakeOptions(false));

    servers.push(server);

    return server;
}

/** What TypeORM throws for a table a migration has not created yet. */
function behindSchemaError(): Error {
    return Object.assign(new Error('relation "connection" does not exist'), { driverError: { code: '42P01' } });
}

function configsOf(store: TestStore) {
    return createConnectionConfigStore({
        connectionService: store.connectionService,
        lockService: createTestEngine({ agents: [] }).lockService,
        keyring: () => keyring,
    });
}

function envAccount(port: number, extra: Record<string, unknown> = {}) {
    return {
        id: 'work',
        address: 'bob@y.test',
        host: '127.0.0.1',
        security: 'plain',
        port,
        ...extra,
    };
}

function envOf(account: Record<string, unknown>): Record<string, string> {
    return {
        [MAIL_ACCOUNTS_VARIABLE]: JSON.stringify([account]),
        CHAMVI_MAIL_WORK_PASSWORD: PASSWORD,
    };
}

async function seed(store: TestStore, account: string, port: number, extra: Record<string, unknown> = {}): Promise<void> {
    await configsOf(store).create(`mail-${account}`, MAIL_CONNECTION_TYPE, {
        settings: {
            address: `${account}@y.test`,
            host: '127.0.0.1',
            port,
            security: 'plain',
            ...extra,
        },
        secrets: { set: { password: STORED_PASSWORD } },
    });
}

function accountsAgent(): Agent {
    return defineModelAgent({
        name: 'assistant',
        instructions: 'Read the mail.',
        model: mockModel([
            {
                parts: [{
                    type: 'tool-call',
                    toolName: 'mail_accounts',
                    input: {},
                    toolCallId: 'c0',
                }],
            },
            { parts: [{ type: 'text', text: 'Done.' }] },
        ]),
        tools: mailTools(),
    });
}

type HarnessInput = Omit<ModuleHarnessOptions, 'modules'> & {
    store: TestStore;
    options: ToolMailModuleOptions;
};

async function harnessOf(input: HarnessInput): Promise<ModuleHarness> {
    const {
        store,
        options,
        ...rest
    } = input;
    const harness = await createModuleHarness({
        keyring,
        ...rest,
        modules: [
            configModule({
                logger: createLogger({
                    level: 'warn',
                    write: (line) => {
                        logLines.push(line);
                    },
                }),
            }),
            storeModuleOf(store),
            engineModule(),
            toolMailModule(options),
        ],
    });

    harnesses.push(harness);

    return harness;
}

function providerOf(harness: ModuleHarness): IConnectionTypeProvider {
    const [provider] = harness.container.resolveAll(AppToken.CONNECTION_TYPES);

    if (!provider) {
        throw new Error('expected a connection type provider');
    }

    return provider;
}

function connectionOf(harness: ModuleHarness, name: string): DeclaredConnection {
    const connection = providerOf(harness).connections().find((entry) => entry.name === name);

    if (!connection) {
        throw new Error(`expected the connection ${name}`);
    }

    return connection;
}

async function runAccounts(harness: ModuleHarness) {
    const engine = harness.container.resolve(AppToken.ENGINE);
    const { runId } = await engine.dispatch({
        agent: 'assistant',
        trigger: 'http',
        channel: 'http',
        payload: {},
    });

    await engine.idle();

    const run = await engine.runService.findOne(runId);
    const step = (await engine.stepService.find(runId))
        .find((entry) => entry.kind === 'tool' && entry.name === 'mail_accounts');

    return { run, step };
}

/** Every call of a connection repository method (and its entries' and secrets'), by name: `find*` reads, the rest writes. */
function spyConnections(store: TestStore): string[] {
    const calls: string[] = [];
    const { connectionRepository } = store;

    if (!connectionRepository) {
        throw new Error('expected a connection repository');
    }

    for (const repository of [connectionRepository, connectionRepository.entries, connectionRepository.secrets] as object[]) {
        for (const key of ['findMany', 'findOneById', 'findOneBy', 'findManyBy', 'save', 'upsert', 'remove', 'removeMany']) {
            const method = (repository as Record<string, (...args: unknown[]) => unknown>)[key]!;

            // an own property: the copies a transaction binds take it along
            (repository as Record<string, unknown>)[key] = function spied(this: unknown, ...args: unknown[]) {
                calls.push(key);

                return Reflect.apply(method, this, args);
            };
        }
    }

    return calls;
}

function testLogger() {
    return createLogger({
        level: 'warn',
        write: (line) => {
            logLines.push(line);
        },
    });
}

function storedRow(name: string, values: StoredConnection['values']): StoredConnection {
    return {
        name,
        values,
        revision: 1,
        id: `${name}-1`,
    };
}

const logins = (server: FakeImap) => untagged(server.commands).filter((command) => command.startsWith('LOGIN'));

describe('toolMailModule() configuration', () => {
    it('declares the mail connection type', async () => {
        const harness = await harnessOf({ store: storeOf(), options: { env: {} } });
        const { definition } = providerOf(harness);

        expect(definition.type).toBe('mail');
        expect(definition.multiple).toBe(true);
        expect(definition.fields.map((field) => field.key)).toEqual([
            'address',
            'host',
            'port',
            'security',
            'user',
            'password',
            'smtpHost',
            'smtpPort',
            'smtpSecurity',
        ]);
        expect(definition.fields.find((field) => field.key === 'password')).toMatchObject({ kind: 'secret', required: true });
        expect(definition.fields.find((field) => field.key === 'security')).toMatchObject({ kind: 'select' });
        expect(definition.uniqueId?.({ address: 'Bob@Y.test' })).toBe('bob@y.test');
    });

    it('declares the smtp fields, each binding the secrets', async () => {
        const harness = await harnessOf({ store: storeOf(), options: { env: {} } });
        const { definition } = providerOf(harness);
        const fieldOf = (key: string) => definition.fields.find((field) => field.key === key);

        expect(fieldOf('smtpHost')).toMatchObject({ kind: 'string', bindsSecrets: true });
        expect(fieldOf('smtpPort')).toMatchObject({ kind: 'number', bindsSecrets: true });
        expect(fieldOf('smtpSecurity')).toMatchObject({
            kind: 'select',
            options: ['tls', 'starttls', 'plain'],
            bindsSecrets: true,
        });
    });

    it('a stored account with smtpHost loads with smtp settings', async () => {
        const definition = mailConnectionDefinition();
        const loaded = await loadMailAccounts({
            definition,
            declared: [],
            pinned: false,
            env: {},
            logger: testLogger(),
            rows: [storedRow('mail-home', {
                address: 'home@y.test',
                host: '127.0.0.1',
                password: STORED_PASSWORD,
                smtpHost: 'smtp.y.test',
                smtpSecurity: 'starttls',
            })],
            editable: true,
        });

        expect(loaded.accounts).toHaveLength(1);
        expect(loaded.accounts[0]?.smtp).toEqual({ host: 'smtp.y.test', security: 'starttls' });
    });

    it.each([
        ['a port without a host', { smtpPort: 2525 }, 'smtp.host'],
        ['a security without a host', { smtpSecurity: 'starttls' }, 'smtp.host'],
        ['a port out of range', { smtpHost: 'smtp.y.test', smtpPort: 70_000 }, 'smtp.port'],
    ])('a stored-only account with %s drops smtp with a warning and still reads', async (_, smtp, field) => {
        const definition = mailConnectionDefinition();
        const loaded = await loadMailAccounts({
            definition,
            declared: [],
            pinned: false,
            env: {},
            logger: testLogger(),
            rows: [storedRow('mail-home', {
                address: 'home@y.test',
                host: '127.0.0.1',
                password: STORED_PASSWORD,
                ...smtp,
            })],
            editable: true,
        });

        expect(loaded.accounts).toHaveLength(1);
        expect(loaded.accounts[0]?.id).toBe('home');
        expect(loaded.accounts[0]?.smtp).toBeUndefined();
        expect(loaded.connections[0]?.resolved.state).toBe('incomplete');
        expect(logLines.some((line) => line.includes('home') && line.includes(field) && line.includes('reads only'))).toBe(true);
        expect(logLines.join('\n')).not.toContain('70000');
    });

    it('a refused stored smtp value on a declared account drops only the stored smtp settings', async () => {
        const definition = mailConnectionDefinition();
        const loaded = await loadMailAccounts({
            definition,
            declared: [{
                id: 'work',
                address: 'bob@y.test',
                host: '127.0.0.1',
                user: 'bob@y.test',
                smtp: { host: 'smtp.y.test' },
            }],
            pinned: false,
            env: { CHAMVI_MAIL_WORK_PASSWORD: PASSWORD },
            logger: testLogger(),
            rows: [storedRow('mail-work', {
                user: 'stored-user',
                port: 1143,
                security: 'starttls',
                smtpPort: 70_000,
                smtpSecurity: 'plain',
            })],
            editable: true,
        });

        expect(loaded.accounts).toHaveLength(1);
        expect(loaded.accounts[0]).toMatchObject({
            user: 'stored-user',
            port: 1143,
            security: 'starttls',
            password: PASSWORD,
            smtp: { host: 'smtp.y.test' },
        });
        expect(loaded.accounts[0]?.smtp).toEqual({ host: 'smtp.y.test' });
        expect(loaded.connections[0]?.resolved.state).toBe('incomplete');
        expect(loaded.connections[0]?.resolved.values.user).toBe('stored-user');
        expect(logLines.some((line) => line.includes('work') && line.includes('smtp.port'))).toBe(true);
        expect(logLines.join('\n')).not.toContain('70000');
    });

    it('env smtp settings win per field over the stored row', async () => {
        const definition = mailConnectionDefinition();
        const loaded = await loadMailAccounts({
            definition,
            declared: [{
                id: 'work',
                address: 'bob@y.test',
                host: '127.0.0.1',
                user: 'bob@y.test',
                smtp: { host: 'smtp.env.test' },
            }],
            pinned: false,
            env: { CHAMVI_MAIL_WORK_PASSWORD: PASSWORD },
            logger: testLogger(),
            rows: [storedRow('mail-work', {
                smtpHost: 'smtp.stored.test',
                smtpPort: 2525,
                smtpSecurity: 'plain',
            })],
            editable: true,
        });

        expect(loaded.accounts[0]?.smtp).toEqual({
            host: 'smtp.env.test',
            port: 2525,
            security: 'plain',
        });
        expect(loaded.connections[0]?.resolved.sources.smtpHost).toEqual({ kind: 'env', variable: MAIL_ACCOUNTS_VARIABLE });
        expect(loaded.connections[0]?.resolved.sources.smtpPort).toEqual({ kind: 'store' });
    });

    it('a bad stored smtpPort on a declared account is dropped with a warning and the account listed incomplete', async () => {
        const store = storeOf();

        await configsOf(store).create('mail-work', MAIL_CONNECTION_TYPE, {
            settings: { smtpPort: 70_000, user: 'stored-user' },
            secrets: { set: { password: STORED_PASSWORD } },
        });

        const harness = await harnessOf({
            store,
            options: { env: { [MAIL_ACCOUNTS_VARIABLE]: JSON.stringify([envAccount(1, { smtp: { host: 'smtp.y.test' } })]) } },
        });
        const work = connectionOf(harness, 'mail-work');

        expect(work.resolved.state).toBe('incomplete');
        expect(work.resolved.values.smtpPort).toBeUndefined();
        expect(work.resolved.values.smtpHost).toBe('smtp.y.test');
        expect(work.resolved.sources.password).toEqual({ kind: 'store' });
        expect(logLines.some((line) => line.includes('work') && line.includes('smtp.port'))).toBe(true);
        expect(logLines.join('\n')).not.toContain('70000');
    });

    it('a pinned account keeps its smtp settings and a bad one fails the factory', async () => {
        const harness = await harnessOf({
            store: storeOf(),
            options: { accounts: [{ ...accountOf(1), smtp: { host: 'smtp.y.test', port: 2525 } }] },
        });

        expect(connectionOf(harness, 'mail-work').resolved.values).toMatchObject({ smtpHost: 'smtp.y.test', smtpPort: 2525 });
        expect(() => toolMailModule({
            accounts: [{
                ...accountOf(1),
                smtp: { host: '' },
            }],
        })).toThrow('toolMailModule() accounts[0].smtp.host must be a non-empty string.');
    });

    it('loads env accounts and stored accounts together, env winning per field', async () => {
        const server = await fake();
        const store = storeOf();

        await seed(store, 'home', server.port);
        // the same account as the env one: the env wins, the store fills what the env leaves open
        await configsOf(store).create('mail-work', MAIL_CONNECTION_TYPE, {
            settings: {
                address: 'stored@y.test',
                host: 'stored.test',
                user: 'stored-user',
            },
            secrets: { set: { password: STORED_PASSWORD } },
        });

        const harness = await harnessOf({
            store,
            agents: [accountsAgent()],
            options: { env: envOf(envAccount(server.port)) },
        });
        const { run, step } = await runAccounts(harness);

        expect(run?.status).toBe('completed');
        expect(step?.error).toBeUndefined();
        expect((step?.output as MailAccountView[]).map((account) => account.account).sort()).toEqual(['home', 'work']);

        const commands = logins(server).join('\n');

        // the stored user fills the field no variable sets; the password stays the env's
        expect(commands).toContain('stored-user');
        expect(commands).toContain(PASSWORD);
        expect(commands).toContain('home@y.test');
        expect(commands).toContain(STORED_PASSWORD);

        const work = connectionOf(harness, 'mail-work');

        expect(work.resolved.values.host).toBe('127.0.0.1');
        expect(work.resolved.values.user).toBe('stored-user');
        expect(work.resolved.sources.host).toEqual({ kind: 'env', variable: MAIL_ACCOUNTS_VARIABLE });
        expect(work.resolved.sources.user).toEqual({ kind: 'store' });
        expect(work.resolved.sources.password).toEqual({ kind: 'env', variable: 'CHAMVI_MAIL_WORK_PASSWORD' });
    });

    it('an env-declared account is listed locked and not deletable', async () => {
        const server = await fake();
        const harness = await harnessOf({ store: storeOf(), options: { env: envOf(envAccount(server.port)) } });
        const work = connectionOf(harness, 'mail-work');

        expect(work.account).toBe('work');
        expect(work.deletable).toBe(false);
        expect(work.editable).toBe(true);
        expect(work.loadedRevision).toBeUndefined();
        expect(work.resolved.state).toBe('configured');
        expect(work.resolved.sources.address).toEqual({ kind: 'env', variable: MAIL_ACCOUNTS_VARIABLE });
        expect(work.resolved.sources.password).toEqual({ kind: 'env', variable: 'CHAMVI_MAIL_WORK_PASSWORD' });
        expect(providerOf(harness).creatable()).toBe(true);
    });

    it('a stored account is listed under its account id, named mail-<id>', async () => {
        const server = await fake();
        const store = storeOf();

        await seed(store, 'home', server.port);

        const { revision } = (await configsOf(store).describe('mail-home'))!;
        const harness = await harnessOf({ store, options: { env: {} } });
        const home = connectionOf(harness, 'mail-home');

        expect(home.account).toBe('home');
        expect(home.editable).toBe(true);
        expect(home.deletable).toBe(true);
        expect(home.loadedRevision).toBe(revision);
        expect(home.loadedGeneration).toBe((await store.connectionService.findOneOrFail(home.name)).id);
        expect(home.resolved.sources.password).toEqual({ kind: 'store' });
        expect(home.resolved.state).toBe('configured');
    });

    it('a stored account ignores the variables named after it, with a warning', async () => {
        const server = await fake();
        const store = storeOf();

        await seed(store, 'home', server.port);

        const harness = await harnessOf({
            store,
            agents: [accountsAgent()],
            options: { env: { CHAMVI_MAIL_HOME_USER: 'env-user', CHAMVI_MAIL_HOME_PASSWORD: PASSWORD } },
        });

        await runAccounts(harness);

        expect(logins(server).join('\n')).toContain(STORED_PASSWORD);
        expect(logins(server).join('\n')).not.toContain('env-user');
        expect(logins(server).join('\n')).not.toContain(PASSWORD);
        expect(connectionOf(harness, 'mail-home').resolved.sources).toMatchObject({ user: { kind: 'unset' }, password: { kind: 'store' } });
        expect(logLines.join('\n')).toContain('CHAMVI_MAIL_HOME_USER');
        expect(logLines.join('\n')).toContain('CHAMVI_MAIL_HOME_PASSWORD');
        expect(logLines.join('\n')).not.toContain('env-user');
        expect(logLines.join('\n')).not.toContain(PASSWORD);
    });

    it('a stored account missing a required field is listed incomplete and not used', async () => {
        const store = storeOf();

        await configsOf(store).create('mail-home', MAIL_CONNECTION_TYPE, { settings: { host: '127.0.0.1' } });

        const harness = await harnessOf({
            store,
            agents: [accountsAgent()],
            options: { env: {} },
        });

        expect(connectionOf(harness, 'mail-home').resolved.state).toBe('incomplete');

        const { run, step } = await runAccounts(harness);

        expect(run?.status).toBe('completed');
        expect(step?.error).toMatchObject({ code: 'connection_not_configured' });
    });

    it('a stored account with a value the client refuses is listed incomplete and not used', async () => {
        const store = storeOf();

        await seed(store, 'home', 70_000);

        const harness = await harnessOf({
            store,
            agents: [accountsAgent()],
            options: { env: {} },
        });

        expect(connectionOf(harness, 'mail-home').resolved.state).toBe('incomplete');

        const { step } = await runAccounts(harness);

        expect(step?.error).toMatchObject({ code: 'connection_not_configured' });
    });

    it('a stored account without its password stays incomplete whatever its variables hold: the app starts', async () => {
        const store = storeOf();

        await configsOf(store).create('mail-home', MAIL_CONNECTION_TYPE, { settings: { address: 'home@y.test', host: '127.0.0.1' } });

        const harness = await harnessOf({
            store,
            options: { env: { CHAMVI_MAIL_HOME_USER: 'env-user', CHAMVI_MAIL_HOME_PASSWORD: PASSWORD } },
        });

        expect(connectionOf(harness, 'mail-home').resolved).toMatchObject({ state: 'incomplete', missing: ['password'] });
    });

    it('ignores a row of the type that is no account name', async () => {
        const store = storeOf();

        await configsOf(store).create('other', MAIL_CONNECTION_TYPE, { settings: { host: 'x.test' } });

        const harness = await harnessOf({ store, options: { env: {} } });

        expect(providerOf(harness).connections()).toEqual([]);
    });

    it('an account whose stored name would exceed 64 characters is used but not listed', async () => {
        const server = await fake();
        const id = `a${'-b'.repeat(31)}`;
        const harness = await harnessOf({
            store: storeOf(),
            agents: [accountsAgent()],
            options: {
                env: {
                    [MAIL_ACCOUNTS_VARIABLE]: JSON.stringify([envAccount(server.port, { id })]),
                    [`CHAMVI_MAIL_${id.toUpperCase().replaceAll('-', '_')}_PASSWORD`]: PASSWORD,
                },
            },
        });

        expect(providerOf(harness).connections()).toEqual([]);

        const { step } = await runAccounts(harness);

        expect((step?.output as MailAccountView[]).map((account) => account.account)).toEqual([id]);
    });

    it('explicit accounts pin the set: store unread, creatable() false', async () => {
        const server = await fake();
        const store = storeOf();

        await seed(store, 'home', server.port);

        const calls = spyConnections(store);
        const harness = await harnessOf({
            store,
            agents: [accountsAgent()],
            options: { env: {}, accounts: [accountOf(server.port, 'code')] },
        });
        const provider = providerOf(harness);
        const code = connectionOf(harness, 'mail-code');

        expect(calls).toEqual([]);
        expect(provider.creatable()).toBe(false);
        expect(provider.connections().map((entry) => entry.name)).toEqual(['mail-code']);
        expect(code.editable).toBe(false);
        expect(code.deletable).toBe(false);
        expect(code.resolved.sources.password).toEqual({ kind: 'code' });
        expect(code.resolved.state).toBe('configured');

        const { step } = await runAccounts(harness);

        expect((step?.output as MailAccountView[]).map((account) => account.account)).toEqual(['code']);
    });

    it('zero accounts keep the context provided and tools return a not-configured tool error, the run does not fail', async () => {
        const harness = await harnessOf({
            store: storeOf(),
            agents: [accountsAgent()],
            options: { env: {} },
        });

        expect(harness.container.resolveAll(AppToken.LIFECYCLE_HOOKS).some((hook) => hook.name === TOOL_MAIL_MODULE_NAME)).toBe(true);

        const { run, step } = await runAccounts(harness);

        expect(run?.status).toBe('completed');
        expect(step?.error).toMatchObject({ code: 'connection_not_configured' });
        expect(harness.reported).toEqual([]);
    });

    it('a store without connections stays env-only: nothing creatable, the configs token untouched', async () => {
        const server = await fake();
        const store = storeOf({ connections: false });

        const harness = await harnessOf({ store, options: { env: envOf(envAccount(server.port)) } });
        const work = connectionOf(harness, 'mail-work');

        expect(providerOf(harness).creatable()).toBe(false);
        expect(work.editable).toBe(false);
        expect(work.deletable).toBe(false);
    });

    it('migrate mode reads nothing', async () => {
        const server = await fake();
        const store = storeOf();

        await seed(store, 'home', server.port);

        const calls = spyConnections(store);
        const harness = await harnessOf({
            store,
            mode: 'migrate',
            env: { DATABASE_URL: 'postgres://chamvi@127.0.0.1:1/chamvi' },
            options: { env: envOf(envAccount(server.port)) },
        });

        expect(calls).toEqual([]);
        expect(harness.container.resolveAll(AppToken.CONNECTION_TYPES)).toEqual([]);
        expect(harness.container.resolveAll(AppToken.LIFECYCLE_HOOKS).filter((hook) => hook.name === TOOL_MAIL_MODULE_NAME)).toEqual([]);
    });

    it('a check reads and writes nothing to the store', async () => {
        const server = await fake();
        const store = storeOf();

        await seed(store, 'home', server.port);

        const calls = spyConnections(store);
        const harness = await harnessOf({
            store,
            check: true,
            options: { env: envOf(envAccount(server.port)) },
        });

        // the read half: the stored account is seen
        expect(calls).toContain('findMany');
        expect(calls).toContain('findManyBy');
        expect(providerOf(harness).connections().map((entry) => entry.name).sort()).toEqual(['mail-home', 'mail-work']);
        // the write half: only reads reached the repository, and no server was contacted
        expect(calls.filter((name) => !name.startsWith('find'))).toEqual([]);
        expect(server.commands).toEqual([]);
    });

    it('a check lists an incomplete stored account as incomplete', async () => {
        const store = storeOf();

        await configsOf(store).create('mail-home', MAIL_CONNECTION_TYPE, { settings: { host: '127.0.0.1' } });

        const harness = await harnessOf({
            store,
            check: true,
            options: { env: {} },
        });

        expect(connectionOf(harness, 'mail-home').resolved.state).toBe('incomplete');
    });

    it('a check on a store behind its migrations warns and continues env-only', async () => {
        const server = await fake();
        const store = storeOf();

        store.connectionRepository!.findMany = async () => {
            throw behindSchemaError();
        };

        const harness = await harnessOf({
            store,
            check: true,
            options: { env: envOf(envAccount(server.port)) },
        });

        expect(logLines.some((line) => line.includes('behind'))).toBe(true);
        expect(providerOf(harness).connections().map((entry) => entry.name)).toEqual(['mail-work']);
    });

    it('a check on a behind store still fails a declared account with no password in env', async () => {
        const store = storeOf();

        store.connectionRepository!.findMany = async () => {
            throw behindSchemaError();
        };

        await expect(harnessOf({
            store,
            check: true,
            options: { env: { [MAIL_ACCOUNTS_VARIABLE]: JSON.stringify([envAccount(1)]) } },
        })).rejects.toThrow(/CHAMVI_MAIL_WORK_PASSWORD/);
    });

    it('an unreadable stored account is listed failed and not used; the app starts and the env account works', async () => {
        const server = await fake();
        const store = storeOf();

        await seed(store, 'home', server.port);

        // the row was sealed under a key this keyring does not hold
        const harness = await harnessOf({
            store,
            keyring: createKeyring([{ id: 'k1', key: randomBytes(32) }]),
            agents: [accountsAgent()],
            options: { env: envOf(envAccount(server.port)) },
        });

        expect(connectionOf(harness, 'mail-home').resolved).toMatchObject({
            state: 'failed',
            reason: expect.stringContaining('decryption_failed'),
        });
        expect(connectionOf(harness, 'mail-home').deletable).toBe(true);

        const { run, step } = await runAccounts(harness);

        expect(run?.status).toBe('completed');
        expect((step?.output as MailAccountView[]).map((account) => account.account)).toEqual(['work']);
        expect(logLines.some((line) => line.includes('mail-home') && line.includes('decryption_failed'))).toBe(true);
        expect(logLines.join('\n')).not.toContain(STORED_PASSWORD);
    });

    it('a declared account whose password only an unreadable row holds is listed failed and not used', async () => {
        const store = storeOf();

        await configsOf(store).create('mail-work', MAIL_CONNECTION_TYPE, { secrets: { set: { password: STORED_PASSWORD } } });

        const harness = await harnessOf({
            store,
            keyring: createKeyring([{ id: 'k1', key: randomBytes(32) }]),
            agents: [accountsAgent()],
            options: { env: { [MAIL_ACCOUNTS_VARIABLE]: JSON.stringify([envAccount(1)]) } },
        });

        expect(connectionOf(harness, 'mail-work').resolved.state).toBe('failed');

        const { run, step } = await runAccounts(harness);

        expect(run?.status).toBe('completed');
        expect(step?.error).toMatchObject({ code: 'connection_not_configured' });
    });

    it('a declared account whose env password shadows an unreadable row stays in use', async () => {
        const server = await fake();
        const store = storeOf();

        await configsOf(store).create('mail-work', MAIL_CONNECTION_TYPE, { secrets: { set: { password: STORED_PASSWORD } } });

        const harness = await harnessOf({
            store,
            keyring: createKeyring([{ id: 'k1', key: randomBytes(32) }]),
            agents: [accountsAgent()],
            options: { env: envOf(envAccount(server.port)) },
        });

        expect(connectionOf(harness, 'mail-work').resolved.state).toBe('configured');

        const { step } = await runAccounts(harness);

        expect((step?.output as MailAccountView[]).map((account) => account.account)).toEqual(['work']);
    });

    it('an invalid stored value on a declared account is dropped and the account listed incomplete', async () => {
        const store = storeOf();

        await configsOf(store).create('mail-work', MAIL_CONNECTION_TYPE, {
            settings: { port: 70_000, user: 'stored-user' },
            secrets: { set: { password: STORED_PASSWORD } },
        });

        const withoutPort: Record<string, unknown> = envAccount(1);

        delete withoutPort.port;

        const harness = await harnessOf({
            store,
            options: { env: { [MAIL_ACCOUNTS_VARIABLE]: JSON.stringify([withoutPort]) } },
        });
        const work = connectionOf(harness, 'mail-work');

        expect(work.resolved.state).toBe('incomplete');
        expect(work.resolved.values.port).toBeUndefined();
        expect(work.resolved.sources.port).toEqual({ kind: 'unset' });
        // a stored secret is no refused value: the dashboard's password stays
        expect(work.resolved.sources.password).toEqual({ kind: 'store' });
        expect(work.deletable).toBe(false);
        expect(logLines.some((line) => line.includes('work') && line.includes('port'))).toBe(true);
        expect(logLines.join('\n')).not.toContain('70000');
        expect(logLines.join('\n')).not.toContain(STORED_PASSWORD);
    });

    it('a check still fails on a read error that is not a behind schema', async () => {
        const store = storeOf();

        store.connectionRepository!.findMany = async () => {
            throw new Error('boom');
        };

        await expect(harnessOf({
            store,
            check: true,
            options: { env: {} },
        })).rejects.toThrow('boom');
    });

    it('a start fails on a behind schema: only a check tolerates it', async () => {
        const store = storeOf();

        store.connectionRepository!.findMany = async () => {
            throw behindSchemaError();
        };

        await expect(harnessOf({ store, options: { env: {} } })).rejects.toThrow('does not exist');
    });

    it('a declared account takes a password missing from env from the store', async () => {
        const server = await fake();
        const store = storeOf();

        await configsOf(store).create('mail-work', MAIL_CONNECTION_TYPE, { secrets: { set: { password: STORED_PASSWORD } } });

        const harness = await harnessOf({
            store,
            agents: [accountsAgent()],
            options: { env: { [MAIL_ACCOUNTS_VARIABLE]: JSON.stringify([envAccount(server.port)]) } },
        });
        const work = connectionOf(harness, 'mail-work');

        expect(work.resolved.sources.password).toEqual({ kind: 'store' });
        expect(work.resolved.sources.host).toEqual({ kind: 'env', variable: MAIL_ACCOUNTS_VARIABLE });
        expect(work.deletable).toBe(false);

        const { step } = await runAccounts(harness);

        expect(step?.error).toBeUndefined();
        expect(logins(server).join('\n')).toContain(STORED_PASSWORD);
    });

    it('a declared account with its password in neither env nor store fails in setup naming the variable', async () => {
        const env = { [MAIL_ACCOUNTS_VARIABLE]: JSON.stringify([envAccount(1)]) };

        expect(() => toolMailModule({ env })).not.toThrow();
        await expect(harnessOf({ store: storeOf(), options: { env } })).rejects.toThrow(/CHAMVI_MAIL_WORK_PASSWORD/);
    });

    it('a store without connections fails a declared account missing its password', async () => {
        const store = storeOf({ connections: false });

        await expect(harnessOf({
            store,
            options: { env: { [MAIL_ACCOUNTS_VARIABLE]: JSON.stringify([envAccount(1)]) } },
        })).rejects.toThrow(/CHAMVI_MAIL_WORK_PASSWORD/);
    });

    it('an invalid CHAMVI_MAIL_ACCOUNTS still throws at the factory', () => {
        expect(() => toolMailModule({ env: { [MAIL_ACCOUNTS_VARIABLE]: '{' } })).toThrow(InvalidAgentDefinitionError);
        expect(() => toolMailModule({ env: { [MAIL_ACCOUNTS_VARIABLE]: '{' } })).toThrow(new RegExp(MAIL_ACCOUNTS_VARIABLE));
    });

    it('never places a stored password in a listed source or error', async () => {
        const server = await fake();
        const store = storeOf();

        await seed(store, 'home', server.port);

        const harness = await harnessOf({ store, options: { env: {} } });
        const home = connectionOf(harness, 'mail-home');

        expect(JSON.stringify(home.resolved.sources)).not.toContain(STORED_PASSWORD);
    });
});
