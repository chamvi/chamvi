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
    InvalidAgentDefinitionError,
    createConnectionConfigStore,
    createKeyring,
    createMemoryStore,
    defineModelAgent,
} from '@chamvi/core';
import type {
    Agent,
    DeclaredConnection,
    IConnectionTypeProvider,
    IStore,
} from '@chamvi/core';
import { mockModel } from '@chamvi/test-kit';
import {
    AppToken,
    configModule,
    createLogger,
    engineModule,
    storeModule,
} from '@chamvi/app';
import { createModuleHarness } from '@chamvi/app/testing';
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
import { createFakeImap } from '../../utils/imap.ts';
import type { FakeImap } from '../../utils/imap.ts';
import {
    PASSWORD,
    accountOf,
    fakeOptions,
    untagged,
} from '../../utils/mail.ts';

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

function configsOf(store: IStore) {
    return createConnectionConfigStore({ store, keyring: () => keyring });
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

async function seed(store: IStore, account: string, port: number, extra: Record<string, unknown> = {}): Promise<void> {
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
    store: IStore;
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
            storeModule({ store }),
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

    const run = await engine.store.runs.findOne(runId);
    const step = (await engine.store.steps.find(runId))
        .find((entry) => entry.kind === 'tool' && entry.name === 'mail_accounts');

    return { run, step };
}

/** Every call of a connections repository method, by name. */
function spyConnections(store: IStore): string[] {
    const calls: string[] = [];
    const { connections } = store;

    if (!connections) {
        throw new Error('expected a connections repository');
    }

    for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(connections))) {
        const method = (connections as unknown as Record<string, unknown>)[key];

        if (key !== 'constructor' && typeof method === 'function') {
            (connections as unknown as Record<string, unknown>)[key] = (...args: unknown[]) => {
                calls.push(key);

                return Reflect.apply(method, connections, args);
            };
        }
    }

    return calls;
}

const logins = (server: FakeImap) => untagged(server.commands).filter((command) => command.startsWith('LOGIN'));

describe('toolMailModule() configuration', () => {
    it('declares the mail connection type', async () => {
        const harness = await harnessOf({ store: createMemoryStore(), options: { env: {} } });
        const { definition } = providerOf(harness);

        expect(definition.type).toBe('mail');
        expect(definition.multiple).toBe(true);
        expect(definition.fields.map((field) => field.key)).toEqual(['address', 'host', 'port', 'security', 'user', 'password']);
        expect(definition.fields.find((field) => field.key === 'password')).toMatchObject({ kind: 'secret', required: true });
        expect(definition.fields.find((field) => field.key === 'security')).toMatchObject({ kind: 'select' });
        expect(definition.uniqueId?.({ address: 'Bob@Y.test' })).toBe('bob@y.test');
    });

    it('loads env accounts and stored accounts together, env winning per field', async () => {
        const server = await fake();
        const store = createMemoryStore();

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
        const harness = await harnessOf({ store: createMemoryStore(), options: { env: envOf(envAccount(server.port)) } });
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
        const store = createMemoryStore();

        await seed(store, 'home', server.port);

        const { revision } = (await configsOf(store).describe('mail-home'))!;
        const harness = await harnessOf({ store, options: { env: {} } });
        const home = connectionOf(harness, 'mail-home');

        expect(home.account).toBe('home');
        expect(home.editable).toBe(true);
        expect(home.deletable).toBe(true);
        expect(home.loadedRevision).toBe(revision);
        expect(home.resolved.sources.password).toEqual({ kind: 'store' });
        expect(home.resolved.state).toBe('configured');
    });

    it('a stored account reads its variables, the env winning', async () => {
        const server = await fake();
        const store = createMemoryStore();

        await seed(store, 'home', server.port);

        const harness = await harnessOf({
            store,
            agents: [accountsAgent()],
            options: { env: { CHAMVI_MAIL_HOME_USER: 'env-user' } },
        });

        await runAccounts(harness);

        expect(logins(server).join('\n')).toContain('env-user');
        expect(connectionOf(harness, 'mail-home').resolved.sources.user).toEqual({ kind: 'env', variable: 'CHAMVI_MAIL_HOME_USER' });
    });

    it('a stored account missing a required field is listed incomplete and not used', async () => {
        const store = createMemoryStore();

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
        const store = createMemoryStore();

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

    it('a stored account partly set from the env without its password fails naming the variable', async () => {
        const store = createMemoryStore();

        await configsOf(store).create('mail-home', MAIL_CONNECTION_TYPE, { settings: { address: 'home@y.test', host: '127.0.0.1' } });

        await expect(harnessOf({
            store,
            options: { env: { CHAMVI_MAIL_HOME_USER: 'env-user' } },
        })).rejects.toThrow(/CHAMVI_MAIL_HOME_PASSWORD/);
    });

    it('ignores a row of the type that is no account name', async () => {
        const store = createMemoryStore();

        await configsOf(store).create('other', MAIL_CONNECTION_TYPE, { settings: { host: 'x.test' } });

        const harness = await harnessOf({ store, options: { env: {} } });

        expect(providerOf(harness).connections()).toEqual([]);
    });

    it('an account whose stored name would exceed 64 characters is used but not listed', async () => {
        const server = await fake();
        const id = `a${'-b'.repeat(31)}`;
        const harness = await harnessOf({
            store: createMemoryStore(),
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
        const store = createMemoryStore();

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
            store: createMemoryStore(),
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
        const store: IStore = createMemoryStore();

        delete store.connections;

        const harness = await harnessOf({ store, options: { env: envOf(envAccount(server.port)) } });
        const work = connectionOf(harness, 'mail-work');

        expect(providerOf(harness).creatable()).toBe(false);
        expect(work.editable).toBe(false);
        expect(work.deletable).toBe(false);
    });

    it('migrate mode reads nothing', async () => {
        const server = await fake();
        const store = createMemoryStore();

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
        const store = createMemoryStore();

        await seed(store, 'home', server.port);

        const calls = spyConnections(store);
        const harness = await harnessOf({
            store,
            check: true,
            options: { env: envOf(envAccount(server.port)) },
        });

        // the read half: the stored account is seen
        expect(calls).toContain('find');
        expect(calls).toContain('findConfig');
        expect(providerOf(harness).connections().map((entry) => entry.name).sort()).toEqual(['mail-home', 'mail-work']);
        // the write half: only reads reached the repository, and no server was contacted
        expect(calls.filter((name) => !name.startsWith('find'))).toEqual([]);
        expect(server.commands).toEqual([]);
    });

    it('a check lists an incomplete stored account as incomplete', async () => {
        const store = createMemoryStore();

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
        const store = createMemoryStore();

        store.connections!.find = async () => {
            throw behindSchemaError();
        };

        const harness = await harnessOf({
            store,
            check: true,
            options: {
                env: {
                    ...envOf(envAccount(server.port)),
                    CHAMVI_MAIL_WORK_PASSWORD: '',
                },
            },
        });

        expect(logLines.some((line) => line.includes('behind'))).toBe(true);
        expect(providerOf(harness).connections()).toEqual([]);
    });

    it('a check still fails on a read error that is not a behind schema', async () => {
        const store = createMemoryStore();

        store.connections!.find = async () => {
            throw new Error('boom');
        };

        await expect(harnessOf({
            store,
            check: true,
            options: { env: {} },
        })).rejects.toThrow('boom');
    });

    it('a start fails on a behind schema: only a check tolerates it', async () => {
        const store = createMemoryStore();

        store.connections!.find = async () => {
            throw behindSchemaError();
        };

        await expect(harnessOf({ store, options: { env: {} } })).rejects.toThrow('does not exist');
    });

    it('a declared account takes a password missing from env from the store', async () => {
        const server = await fake();
        const store = createMemoryStore();

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
        await expect(harnessOf({ store: createMemoryStore(), options: { env } })).rejects.toThrow(/CHAMVI_MAIL_WORK_PASSWORD/);
    });

    it('a store without connections fails a declared account missing its password', async () => {
        const store: IStore = createMemoryStore();

        delete store.connections;

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
        const store = createMemoryStore();

        await seed(store, 'home', server.port);

        const harness = await harnessOf({ store, options: { env: {} } });
        const home = connectionOf(harness, 'mail-home');

        expect(JSON.stringify(home.resolved.sources)).not.toContain(STORED_PASSWORD);
    });
});
