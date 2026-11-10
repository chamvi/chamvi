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
import { calendarTools } from '@chamvi/tool-calendar';
import type { CalendarListResult } from '@chamvi/tool-calendar';
import {
    CALENDAR_ACCOUNTS_VARIABLE,
    CALENDAR_CONNECTION_TYPE,
    TOOL_CALENDAR_MODULE_NAME,
    toolCalendarModule,
} from '@chamvi/tool-calendar/module';
import type { ToolCalendarModuleOptions } from '@chamvi/tool-calendar/module';
import { FAKE_CALDAV_URL, createFakeCalDav } from '../../utils/caldav.ts';
import type { FakeCalDav } from '../../utils/caldav.ts';
import { weeklyStandup } from '../../utils/ics.ts';

const PASSWORD = 'app-specific-secret';
const STORED_PASSWORD = 'stored-secret-password';

const keyring = createKeyring([{ id: 'k1', key: randomBytes(32) }]);

const harnesses: ModuleHarness[] = [];
const logLines: string[] = [];

afterEach(async () => {
    logLines.length = 0;

    for (const harness of harnesses.splice(0)) {
        await harness.stop();
    }
});

function fake(): FakeCalDav {
    return createFakeCalDav([{
        slug: 'home',
        name: 'Home',
        objects: [weeklyStandup()],
    }]);
}

/** What TypeORM throws for a table a migration has not created yet. */
function behindSchemaError(): Error {
    return Object.assign(new Error('relation "connection" does not exist'), { driverError: { code: '42P01' } });
}

function configsOf(store: IStore) {
    return createConnectionConfigStore({ store, keyring: () => keyring });
}

function envOf(extra: Record<string, unknown> = {}): Record<string, string> {
    return {
        [CALENDAR_ACCOUNTS_VARIABLE]: JSON.stringify([{
            id: 'work',
            url: FAKE_CALDAV_URL,
            address: 'work@icloud.com',
            ...extra,
        }]),
        CHAMVI_CALENDAR_WORK_PASSWORD: PASSWORD,
    };
}

async function seed(store: IStore, account: string, settings: Record<string, unknown> = {}): Promise<void> {
    await configsOf(store).create(`calendar-${account}`, CALENDAR_CONNECTION_TYPE, {
        settings: {
            url: FAKE_CALDAV_URL,
            address: `${account}@icloud.com`,
            ...settings,
        },
        secrets: { set: { password: STORED_PASSWORD } },
    });
}

function listAgent(): Agent {
    return defineModelAgent({
        name: 'planner',
        instructions: 'Plan.',
        model: mockModel([
            {
                parts: [{
                    type: 'tool-call',
                    toolName: 'calendar_list',
                    input: {},
                    toolCallId: 'c0',
                }],
            },
            { parts: [{ type: 'text', text: 'Done.' }] },
        ]),
        tools: calendarTools(),
    });
}

type HarnessInput = Omit<ModuleHarnessOptions, 'modules'> & {
    store: IStore;
    options: ToolCalendarModuleOptions;
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
            toolCalendarModule(options),
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

async function runList(harness: ModuleHarness) {
    const engine = harness.container.resolve(AppToken.ENGINE);
    const { runId } = await engine.dispatch({
        agent: 'planner',
        trigger: 'http',
        channel: 'http',
        payload: {},
    });

    await engine.idle();

    const run = await engine.store.runs.findOne(runId);
    const step = (await engine.store.steps.find(runId))
        .find((entry) => entry.kind === 'tool' && entry.name === 'calendar_list');

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

const basic = (user: string, password: string) => `Basic ${btoa(`${user}:${password}`)}`;

const authorizationsOf = (server: FakeCalDav) => new Set(server.requests.map((request) => request.authorization));

describe('toolCalendarModule() configuration', () => {
    it('declares the calendar connection type', async () => {
        const harness = await harnessOf({ store: createMemoryStore(), options: { env: {} } });
        const { definition } = providerOf(harness);

        expect(definition.type).toBe('calendar');
        expect(definition.multiple).toBe(true);
        expect(definition.fields.map((field) => field.key)).toEqual(['url', 'address', 'user', 'password']);
        expect(definition.fields.find((field) => field.key === 'password')).toMatchObject({ kind: 'secret', required: true });
        expect(definition.uniqueId?.({ url: 'https://DAV.example.com/x', user: 'Peter' })).toBe('https://dav.example.com/x\npeter');
        expect(definition.uniqueId?.({ url: 'https://DAV.example.com/x', address: 'Me@X.test' })).toBe('https://dav.example.com/x\nme@x.test');
    });

    it('loads env accounts and stored accounts together, env winning per field', async () => {
        const server = fake();
        const store = createMemoryStore();

        await seed(store, 'home');
        await configsOf(store).create('calendar-work', CALENDAR_CONNECTION_TYPE, {
            settings: {
                url: 'https://stored.example.com',
                address: 'stored@icloud.com',
                user: 'stored-user',
            },
            secrets: { set: { password: STORED_PASSWORD } },
        });

        const harness = await harnessOf({
            store,
            agents: [listAgent()],
            options: { env: envOf(), fetch: server.fetch },
        });
        const { run, step } = await runList(harness);

        expect(run?.status).toBe('completed');
        expect(step?.error).toBeUndefined();
        expect((step?.output as CalendarListResult).calendars.map((calendar) => calendar.account).sort()).toEqual(['home', 'work']);

        const authorizations = authorizationsOf(server);

        expect(authorizations.has(basic('stored-user', PASSWORD))).toBe(true);
        expect(authorizations.has(basic('home@icloud.com', STORED_PASSWORD))).toBe(true);

        const work = connectionOf(harness, 'calendar-work');

        expect(work.resolved.values.url).toBe(FAKE_CALDAV_URL);
        expect(work.resolved.sources.url).toEqual({ kind: 'env', variable: CALENDAR_ACCOUNTS_VARIABLE });
        expect(work.resolved.sources.user).toEqual({ kind: 'store' });
        expect(work.resolved.sources.password).toEqual({ kind: 'env', variable: 'CHAMVI_CALENDAR_WORK_PASSWORD' });
    });

    it('an env-declared account is listed locked and not deletable', async () => {
        const harness = await harnessOf({ store: createMemoryStore(), options: { env: envOf() } });
        const work = connectionOf(harness, 'calendar-work');

        expect(work.account).toBe('work');
        expect(work.deletable).toBe(false);
        expect(work.editable).toBe(true);
        expect(work.loadedRevision).toBeUndefined();
        expect(work.resolved.state).toBe('configured');
        expect(work.resolved.sources.url).toEqual({ kind: 'env', variable: CALENDAR_ACCOUNTS_VARIABLE });
        expect(work.resolved.sources.address).toEqual({ kind: 'env', variable: CALENDAR_ACCOUNTS_VARIABLE });
        expect(work.resolved.sources.password).toEqual({ kind: 'env', variable: 'CHAMVI_CALENDAR_WORK_PASSWORD' });
        expect(providerOf(harness).creatable()).toBe(true);
    });

    it('a stored account is listed under its account id, named calendar-<id>', async () => {
        const store = createMemoryStore();

        await seed(store, 'home');

        const { revision } = (await configsOf(store).describe('calendar-home'))!;
        const harness = await harnessOf({ store, options: { env: {} } });
        const home = connectionOf(harness, 'calendar-home');

        expect(home.account).toBe('home');
        expect(home.editable).toBe(true);
        expect(home.deletable).toBe(true);
        expect(home.loadedRevision).toBe(revision);
        expect(home.resolved.sources.password).toEqual({ kind: 'store' });
        expect(home.resolved.state).toBe('configured');
    });

    it('a stored account with neither user nor address is listed incomplete and not used', async () => {
        const store = createMemoryStore();

        await configsOf(store).create('calendar-home', CALENDAR_CONNECTION_TYPE, {
            settings: { url: FAKE_CALDAV_URL },
            secrets: { set: { password: STORED_PASSWORD } },
        });

        const harness = await harnessOf({
            store,
            agents: [listAgent()],
            options: { env: {} },
        });

        expect(connectionOf(harness, 'calendar-home').resolved.state).toBe('incomplete');

        const { step } = await runList(harness);

        expect(step?.error).toMatchObject({ code: 'connection_not_configured' });
    });

    it('a stored account partly set from the env without its password fails naming the variable', async () => {
        const store = createMemoryStore();

        await configsOf(store).create('calendar-home', CALENDAR_CONNECTION_TYPE, { settings: { url: FAKE_CALDAV_URL } });

        await expect(harnessOf({
            store,
            options: { env: { CHAMVI_CALENDAR_HOME_USER: 'env-user' } },
        })).rejects.toThrow(/CHAMVI_CALENDAR_HOME_PASSWORD/);
    });

    it('an account whose stored name would exceed 64 characters is used but not listed', async () => {
        const server = fake();
        const id = `a${'-b'.repeat(31)}`;
        const harness = await harnessOf({
            store: createMemoryStore(),
            agents: [listAgent()],
            options: {
                fetch: server.fetch,
                env: {
                    [CALENDAR_ACCOUNTS_VARIABLE]: JSON.stringify([{
                        id, 
                        url: FAKE_CALDAV_URL, 
                        address: 'long@icloud.com', 
                    }]),
                    [`CHAMVI_CALENDAR_${id.toUpperCase().replaceAll('-', '_')}_PASSWORD`]: PASSWORD,
                },
            },
        });

        expect(providerOf(harness).connections()).toEqual([]);

        const { step } = await runList(harness);

        expect((step?.output as CalendarListResult).calendars.map((calendar) => calendar.account)).toEqual([id]);
    });

    it('explicit accounts pin the set: store unread, creatable() false', async () => {
        const server = fake();
        const store = createMemoryStore();

        await seed(store, 'home');

        const calls = spyConnections(store);
        const harness = await harnessOf({
            store,
            agents: [listAgent()],
            options: {
                env: {},
                fetch: server.fetch,
                accounts: [{
                    id: 'code',
                    url: FAKE_CALDAV_URL,
                    user: 'code@icloud.com',
                    password: PASSWORD,
                }],
            },
        });
        const provider = providerOf(harness);
        const code = connectionOf(harness, 'calendar-code');

        expect(calls).toEqual([]);
        expect(provider.creatable()).toBe(false);
        expect(provider.connections().map((entry) => entry.name)).toEqual(['calendar-code']);
        expect(code.editable).toBe(false);
        expect(code.deletable).toBe(false);
        expect(code.resolved.sources.password).toEqual({ kind: 'code' });
        expect(code.resolved.state).toBe('configured');

        const { step } = await runList(harness);

        expect((step?.output as CalendarListResult).calendars.map((calendar) => calendar.account)).toEqual(['code']);
    });

    it('zero accounts keep the context provided and tools return a not-configured tool error, the run does not fail', async () => {
        const harness = await harnessOf({
            store: createMemoryStore(),
            agents: [listAgent()],
            options: { env: {} },
        });

        expect(harness.container.resolveAll(AppToken.LIFECYCLE_HOOKS).some((hook) => hook.name === TOOL_CALENDAR_MODULE_NAME)).toBe(true);

        const { run, step } = await runList(harness);

        expect(run?.status).toBe('completed');
        expect(step?.error).toMatchObject({ code: 'connection_not_configured' });
        expect(harness.reported).toEqual([]);
    });

    it('a store without connections stays env-only: nothing creatable', async () => {
        const store: IStore = createMemoryStore();

        delete store.connections;

        const harness = await harnessOf({ store, options: { env: envOf() } });
        const work = connectionOf(harness, 'calendar-work');

        expect(providerOf(harness).creatable()).toBe(false);
        expect(work.editable).toBe(false);
        expect(work.deletable).toBe(false);
    });

    it('migrate mode reads nothing', async () => {
        const store = createMemoryStore();

        await seed(store, 'home');

        const calls = spyConnections(store);
        const harness = await harnessOf({
            store,
            mode: 'migrate',
            env: { DATABASE_URL: 'postgres://chamvi@127.0.0.1:1/chamvi' },
            options: { env: envOf() },
        });

        expect(calls).toEqual([]);
        expect(harness.container.resolveAll(AppToken.CONNECTION_TYPES)).toEqual([]);
        expect(harness.container.resolveAll(AppToken.LIFECYCLE_HOOKS).filter((hook) => hook.name === TOOL_CALENDAR_MODULE_NAME)).toEqual([]);
    });

    it('a check reads and writes nothing to the store', async () => {
        const server = fake();
        const store = createMemoryStore();

        await seed(store, 'home');

        const calls = spyConnections(store);
        const harness = await harnessOf({
            store,
            check: true,
            options: { env: envOf(), fetch: server.fetch },
        });

        // the read half: the stored account is seen
        expect(calls).toContain('find');
        expect(calls).toContain('findConfig');
        expect(providerOf(harness).connections().map((entry) => entry.name).sort()).toEqual(['calendar-home', 'calendar-work']);
        // the write half: only reads reached the repository, and no server was contacted
        expect(calls.filter((name) => !name.startsWith('find'))).toEqual([]);
        expect(server.requests).toEqual([]);
    });

    it('a check lists an incomplete stored account as incomplete', async () => {
        const store = createMemoryStore();

        await configsOf(store).create('calendar-home', CALENDAR_CONNECTION_TYPE, { settings: { url: FAKE_CALDAV_URL } });

        const harness = await harnessOf({
            store,
            check: true,
            options: { env: {} },
        });

        expect(connectionOf(harness, 'calendar-home').resolved.state).toBe('incomplete');
    });

    it('a check on a store behind its migrations warns and continues env-only', async () => {
        const store = createMemoryStore();

        store.connections!.find = async () => {
            throw behindSchemaError();
        };

        const harness = await harnessOf({
            store,
            check: true,
            options: { env: envOf() },
        });

        expect(logLines.some((line) => line.includes('behind'))).toBe(true);
        expect(providerOf(harness).connections().map((entry) => entry.name)).toEqual(['calendar-work']);
    });

    it('a check on a behind store still fails a declared account with no password in env', async () => {
        const store = createMemoryStore();

        store.connections!.find = async () => {
            throw behindSchemaError();
        };

        await expect(harnessOf({
            store,
            check: true,
            options: { env: { ...envOf(), CHAMVI_CALENDAR_WORK_PASSWORD: '' } },
        })).rejects.toThrow(/CHAMVI_CALENDAR_WORK_PASSWORD/);
    });

    it('an unreadable stored account fails the start naming the connection', async () => {
        const store = createMemoryStore();

        await seed(store, 'home');

        await expect(harnessOf({
            store,
            keyring: createKeyring([{ id: 'k1', key: randomBytes(32) }]),
            options: { env: {} },
        })).rejects.toThrow(/calendar-home/);
    });

    it('an invalid stored value on a declared account is dropped and the account listed incomplete', async () => {
        const store = createMemoryStore();

        await configsOf(store).create('calendar-work', CALENDAR_CONNECTION_TYPE, {
            settings: { user: '' },
            secrets: { set: { password: STORED_PASSWORD } },
        });

        const harness = await harnessOf({
            store,
            options: {
                env: {
                    [CALENDAR_ACCOUNTS_VARIABLE]: JSON.stringify([{
                        id: 'work', 
                        url: FAKE_CALDAV_URL, 
                        address: 'work@icloud.com', 
                    }]), 
                }, 
            },
        });
        const work = connectionOf(harness, 'calendar-work');

        expect(work.resolved.state).toBe('incomplete');
        expect(work.resolved.sources.user).toEqual({ kind: 'unset' });
        expect(work.resolved.sources.password).toEqual({ kind: 'store' });
        expect(work.deletable).toBe(false);
        expect(logLines.some((line) => line.includes('user'))).toBe(true);
        expect(logLines.join('\n')).not.toContain(STORED_PASSWORD);
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
        const server = fake();
        const store = createMemoryStore();

        await configsOf(store).create('calendar-work', CALENDAR_CONNECTION_TYPE, { secrets: { set: { password: STORED_PASSWORD } } });

        const harness = await harnessOf({
            store,
            agents: [listAgent()],
            options: {
                fetch: server.fetch,
                env: {
                    [CALENDAR_ACCOUNTS_VARIABLE]: JSON.stringify([{
                        id: 'work', 
                        url: FAKE_CALDAV_URL, 
                        address: 'work@icloud.com', 
                    }]), 
                },
            },
        });
        const work = connectionOf(harness, 'calendar-work');

        expect(work.resolved.sources.password).toEqual({ kind: 'store' });
        expect(work.deletable).toBe(false);

        const { step } = await runList(harness);

        expect(step?.error).toBeUndefined();
        expect(authorizationsOf(server).has(basic('work@icloud.com', STORED_PASSWORD))).toBe(true);
    });

    it('a declared account with its password in neither env nor store fails in setup naming the variable', async () => {
        const env = {
            [CALENDAR_ACCOUNTS_VARIABLE]: JSON.stringify([{
                id: 'work', 
                url: FAKE_CALDAV_URL, 
                address: 'work@icloud.com', 
            }]), 
        };

        expect(() => toolCalendarModule({ env })).not.toThrow();
        await expect(harnessOf({ store: createMemoryStore(), options: { env } })).rejects.toThrow(/CHAMVI_CALENDAR_WORK_PASSWORD/);
    });

    it('a declared account with no user and no address fails in setup naming the user variable', async () => {
        const env = {
            [CALENDAR_ACCOUNTS_VARIABLE]: JSON.stringify([{ id: 'work', url: FAKE_CALDAV_URL }]),
            CHAMVI_CALENDAR_WORK_PASSWORD: PASSWORD,
        };

        expect(() => toolCalendarModule({ env })).not.toThrow();
        await expect(harnessOf({ store: createMemoryStore(), options: { env } })).rejects.toThrow(/CHAMVI_CALENDAR_WORK_USER/);
    });

    it('a declared account with no user and no address takes the user from the store', async () => {
        const store = createMemoryStore();

        await configsOf(store).create('calendar-work', CALENDAR_CONNECTION_TYPE, { settings: { user: 'stored-user' } });

        const harness = await harnessOf({
            store,
            options: {
                env: {
                    [CALENDAR_ACCOUNTS_VARIABLE]: JSON.stringify([{ id: 'work', url: FAKE_CALDAV_URL }]),
                    CHAMVI_CALENDAR_WORK_PASSWORD: PASSWORD,
                },
            },
        });

        expect(connectionOf(harness, 'calendar-work').resolved.sources.user).toEqual({ kind: 'store' });
    });

    it('an invalid CHAMVI_CALENDAR_ACCOUNTS still throws at the factory', () => {
        expect(() => toolCalendarModule({ env: { [CALENDAR_ACCOUNTS_VARIABLE]: '{' } })).toThrow(InvalidAgentDefinitionError);
        expect(() => toolCalendarModule({ env: { [CALENDAR_ACCOUNTS_VARIABLE]: '{' } })).toThrow(new RegExp(CALENDAR_ACCOUNTS_VARIABLE));
    });
});
