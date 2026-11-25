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
    ConnectionNotConfiguredError,
    ConnectionService,
    InvalidAgentDefinitionError,
    createConnectionConfigStore,
    createKeyring,
    defineModelAgent,
    systemClock,
} from '@chamvi/core';
import { MemoryConnectionRepository, MemoryRegistry } from '@chamvi/store-memory';
import type {
    DeclaredConnection,
    IConnectionTypeProvider,
    IKeyring,
} from '@chamvi/core';
import {
    AppToken,
    configModule,
    createLogger,
    engineModule,
    storeModule,
} from '@chamvi/app';
import type { IModule } from '@chamvi/app';
import { buildModuleHarness, memoryStoreModule } from '@chamvi/app/testing';
import type { ModuleHarness } from '@chamvi/app/testing';
import { DISCORD_CONNECTION_TYPE, discordModule } from '@chamvi/chat-discord/module';
import type { DiscordModuleOptions } from '@chamvi/chat-discord/module';
import { ControllableClock, createTestEngine, textModel } from '@chamvi/test-kit';
import {
    ALICE,
    CHANNEL,
    GUILD,
    ROLE,
    SENTINEL_TOKEN,
    createFakeClients,
    createMemoryState,
    settle,
} from '../../utils/discord.ts';

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
        connectionService: new ConnectionService({ repository: connectionRepository, clock: systemClock }),
    };
}

type TestStore = ReturnType<typeof storeOf>;

const APP_ID = '100000000000000009';
const keyring = createKeyring([{ id: 'k1', key: randomBytes(32) }]);
const harnesses: ModuleHarness[] = [];

afterEach(async () => {
    await Promise.all(harnesses.splice(0).map((harness) => harness.stop()));
});

type WorldInput = {
    moduleEnv?: Record<string, string | undefined>;
    patch?: Partial<DiscordModuleOptions>;
    check?: boolean;
    mode?: 'start' | 'migrate';
    store?: TestStore;
    appEnv?: Record<string, string>;
    extraModules?: (clients: ReturnType<typeof createFakeClients>) => IModule[];
};

function discordEnv(patch: Record<string, string | undefined> = {}): Record<string, string | undefined> {
    return {
        DISCORD_TOKEN: SENTINEL_TOKEN,
        DISCORD_APPLICATION_ID: APP_ID,
        DISCORD_GUILDS: GUILD,
        DISCORD_USERS: ALICE,
        ...patch,
    };
}

function world(input: WorldInput = {}) {
    const clock = new ControllableClock(new Date('2026-11-09T09:00:00Z'));
    const lines: string[] = [];
    const logger = createLogger({
        level: 'debug',
        clock,
        write: (line: string) => {
            lines.push(line);
        },
    });
    const clients = createFakeClients();
    const module = discordModule({
        env: input.moduleEnv ?? discordEnv(),
        resolveInvoker: (identity) => ({
            id: identity.author,
            kind: 'discord',
            bindings: [],
        }),
        state: createMemoryState(),
        approvalUrl: (ref) => `https://chamvi.example/ui/approvals?run=${ref.runId}`,
        clientFactory: clients.factory,
        ...input.patch,
    });
    const harness = buildModuleHarness({
        env: input.appEnv ?? {},
        keyring,
        ...(input.check !== undefined ? { check: input.check } : {}),
        ...(input.mode !== undefined ? { mode: input.mode } : {}),
        agents: [defineModelAgent({
            name: 'assistant',
            model: textModel(),
            instructions: 'Answer.',
            channels: [module.on()],
        })],
        modules: [
            configModule({ clock, logger }),
            input.store ?
                memoryStoreModule({ registry: input.store.registry, connections: input.store.connections }) :
                storeModule(),
            engineModule(),
            module,
            ...(input.extraModules?.(clients) ?? []),
        ],
    });

    harnesses.push(harness);

    return {
        clock,
        lines,
        clients,
        module,
        harness,
        channels: () => harness.container.resolveAll(AppToken.CHANNELS),
        providers: () => harness.container.resolveAll(AppToken.CONNECTION_TYPES) as IConnectionTypeProvider[],
        connection: (): DeclaredConnection => {
            const [provider] = harness.container.resolveAll(AppToken.CONNECTION_TYPES) as IConnectionTypeProvider[];
            const [connection] = provider!.connections();

            return connection!;
        },
    };
}

/** A store holding the connection `name` of the Discord type. */
async function storedWorld(
    name: string,
    update: { settings?: Record<string, unknown>; secrets?: { set: Record<string, string> } },
    sealedWith: IKeyring = keyring,
): Promise<TestStore> {
    const store = storeOf();
    const configs = createConnectionConfigStore({
        connectionService: store.connectionService,
        lockService: createTestEngine({ agents: [] }).lockService,
        keyring: () => sealedWith,
    });

    await configs.create(name, DISCORD_CONNECTION_TYPE, update);

    return store;
}

describe('discordModule', () => {
    it('contributes the channel and a type provider', async () => {
        const w = world();

        await w.harness.setup();

        expect(w.module.name).toBe('chamvi:discord:discord');
        expect(w.channels().map((channel) => channel.name)).toContain('discord');

        const [provider] = w.providers();

        expect(provider?.definition.type).toBe('discord');
        expect(provider?.definition.multiple).toBe(false);
        expect(provider?.creatable()).toBe(false);
        expect(provider?.definition.fields.map((field) => [field.key, field.kind, field.required ?? false])).toEqual([
            ['token', 'secret', true],
            ['applicationId', 'string', true],
            ['guilds', 'list', false],
            ['channels', 'list', false],
            ['users', 'list', false],
            ['roles', 'list', false],
            ['dmUsers', 'list', false],
            ['requireMention', 'boolean', false],
        ]);
        expect(provider?.definition.fields.map((field) => field.env?.('discord'))).toEqual([
            'DISCORD_TOKEN',
            'DISCORD_APPLICATION_ID',
            'DISCORD_GUILDS',
            'DISCORD_CHANNELS',
            'DISCORD_USERS',
            'DISCORD_ROLES',
            'DISCORD_DM_USERS',
            'DISCORD_REQUIRE_MENTION',
        ]);

        const connection = w.connection();

        expect(connection).toMatchObject({
            name: 'discord',
            editable: true,
            deletable: false,
        });
        expect(connection.resolved.state).toBe('configured');
        expect(connection.resolved.sources.token).toEqual({ kind: 'env', variable: 'DISCORD_TOKEN' });
        expect(connection.loadedRevision).toBeUndefined();
    });

    it('the token provider reads the resolved secret', async () => {
        const env = world();

        await env.harness.setup();
        expect(env.clients.last().logins).toEqual([SENTINEL_TOKEN]);

        const store = await storedWorld('discord', {
            settings: {
                applicationId: APP_ID,
                guilds: [GUILD],
                users: [ALICE],
            },
            secrets: { set: { token: 'stored-token' } },
        });
        const stored = world({ moduleEnv: {}, store });

        await stored.harness.setup();
        expect(stored.clients.last().logins).toEqual(['stored-token']);

        const connection = stored.connection();
        const row = await store.connectionService.findOne('discord');

        expect(connection.resolved.sources.token).toEqual({ kind: 'store' });
        expect(connection.loadedRevision).toBe(1);
        expect(connection.loadedGeneration).toBe(row?.id);
    });

    it('nothing set starts idle and never logs in', async () => {
        const w = world({ moduleEnv: {} });

        await w.harness.setup();
        await settle();

        expect(w.clients.clients).toEqual([]);

        const channel = w.channels().find((item) => item.name === 'discord');

        expect(channel).toBeDefined();
        expect(channel?.start).toBeUndefined();
        await expect(channel?.out?.({} as never, 'address', {} as never))
            .rejects.toBeInstanceOf(ConnectionNotConfiguredError);
        expect(w.connection().resolved.state).toBe('not_configured');
        expect(w.connection().editable).toBe(true);
        expect(w.lines.join('\n')).toContain('is not configured');
    });

    it('DISCORD_TOKEN set without an application id fails naming the variable', async () => {
        const w = world({ moduleEnv: { DISCORD_TOKEN: SENTINEL_TOKEN } });
        const failure = await w.harness.setup().catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(InvalidAgentDefinitionError);
        expect((failure as Error).message).toContain('DISCORD_APPLICATION_ID');
        expect((failure as Error).message).not.toContain(SENTINEL_TOKEN);
    });

    it('a check never connects', async () => {
        const w = world({ check: true });

        await w.harness.setup();
        await settle();

        expect(w.clients.clients).toEqual([]);
        expect(w.channels().map((channel) => channel.name)).toContain('discord');
        expect(w.connection().resolved.state).toBe('configured');
    });

    it('the token never appears in logs or errors', async () => {
        const w = world();

        await w.harness.setup();
        w.clients.last().rejectLogin(Object.assign(new Error(`invalid ${SENTINEL_TOKEN}`), { code: 'TokenInvalid' }));
        await settle();

        const refused = w.lines.join('\n');

        expect(refused).toContain('Discord refused the bot token');
        expect(refused).not.toContain(SENTINEL_TOKEN);

        const malformed = (() => {
            try {
                discordModule({
                    env: discordEnv({ DISCORD_GUILDS: SENTINEL_TOKEN }),
                    resolveInvoker: () => undefined,
                    state: createMemoryState(),
                });
            } catch (error) {
                return error as Error;
            }

            return undefined;
        })();

        expect(malformed).toBeInstanceOf(InvalidAgentDefinitionError);
        expect(malformed?.message).toContain('DISCORD_GUILDS');
        expect(malformed?.message).not.toContain(SENTINEL_TOKEN);
    });

    it('a named instance reads its own variables, channel and account', async () => {
        const w = world({
            patch: { name: 'support-bot' },
            moduleEnv: {
                DISCORD_TOKEN: 'the-default-token',
                DISCORD_SUPPORT_BOT_TOKEN: SENTINEL_TOKEN,
                DISCORD_SUPPORT_BOT_APPLICATION_ID: APP_ID,
                DISCORD_SUPPORT_BOT_GUILDS: GUILD,
            },
        });

        await w.harness.setup();

        expect(w.module.name).toBe('chamvi:discord:support-bot');
        expect(w.channels().map((channel) => channel.name)).toContain('support-bot');
        expect(w.clients.last().logins).toEqual([SENTINEL_TOKEN]);
        expect(w.connection().name).toBe('support-bot');
        expect(w.module.conversation({ threadId: `discord:${GUILD}:${CHANNEL}` })).toMatchObject({
            channel: 'support-bot',
            account: 'support-bot',
        });
    });

    it('two modules share one provider', async () => {
        const second = (name: string) => () => [discordModule({
            name,
            env: {},
            resolveInvoker: () => undefined,
            state: createMemoryState(),
        })];
        const w = world({ extraModules: second('other') });

        await w.harness.setup();

        expect(w.providers()).toHaveLength(1);
        expect(w.providers()[0]?.connections().map((connection) => connection.name)).toEqual(['discord', 'other']);
    });

    it('builds the policy from the resolved lists', async () => {
        const w = world({
            moduleEnv: discordEnv({
                DISCORD_USERS: undefined,
                DISCORD_ROLES: ` ${ROLE} `,
                DISCORD_DM_USERS: ALICE,
                DISCORD_CHANNELS: CHANNEL,
                DISCORD_REQUIRE_MENTION: 'false',
            }),
        });

        await w.harness.setup();

        expect(w.connection().resolved.values).toMatchObject({
            guilds: [GUILD],
            channels: [CHANNEL],
            roles: [ROLE],
            dmUsers: [ALICE],
            requireMention: false,
        });
    });

    it('explicit code options win and pin the connection', async () => {
        const store = await storedWorld('discord', { settings: { applicationId: 'stored' } });
        const w = world({
            store,
            moduleEnv: { DISCORD_USERS: ROLE },
            patch: {
                token: SENTINEL_TOKEN,
                applicationId: APP_ID,
                policy: { guilds: [GUILD], users: [ALICE] },
            },
        });

        await w.harness.setup();

        const connection = w.connection();

        expect(w.clients.last().logins).toEqual([SENTINEL_TOKEN]);
        expect(connection.editable).toBe(false);
        expect(connection.loadedRevision).toBeUndefined();
        expect(connection.resolved.values.applicationId).toBe(APP_ID);
        expect(connection.resolved.values.users).toEqual([ALICE]);
        expect(connection.resolved.sources.users).toEqual({ kind: 'code' });
    });

    it('a policy in code alone stays not configured', async () => {
        const w = world({ moduleEnv: {}, patch: { policy: { guilds: [GUILD] } } });

        await w.harness.setup();

        expect(w.clients.clients).toEqual([]);
        expect(w.connection().resolved.state).toBe('not_configured');
    });

    it('a malformed code policy fails at the factory', () => {
        expect(() => world({ moduleEnv: {}, patch: { policy: { guilds: ['nope'] } } })).toThrow(InvalidAgentDefinitionError);
    });

    it('a name outside the agent-name rule is refused', () => {
        expect(() => world({ patch: { name: 'Not Valid' } })).toThrow(/discordModule: name/);
    });

    it.each(['dm', 'x-dm', 'support-bot-dm'])('refuses the name %s, whose USERS variable is a DM allowlist', (name) => {
        expect(() => world({ patch: { name } })).toThrow(InvalidAgentDefinitionError);
        expect(() => world({ patch: { name } })).toThrow(/discordModule: name/);
    });

    it.each(['dms', 'dm-bot', 'adm'])('accepts the name %s', (name) => {
        expect(() => world({ moduleEnv: {}, patch: { name } })).not.toThrow();
    });

    it('a stored value the channel refuses leaves it idle and repairable', async () => {
        const store = await storedWorld('discord', {
            settings: { applicationId: APP_ID, guilds: [SENTINEL_TOKEN] },
            secrets: { set: { token: 'stored-token' } },
        });
        const w = world({ moduleEnv: {}, store });

        await w.harness.setup();

        expect(w.clients.clients).toEqual([]);
        expect(w.channels().find((channel) => channel.name === 'discord')?.start).toBeUndefined();
        expect(w.connection().resolved.state).toBe('incomplete');
        expect(w.connection().loadedRevision).toBe(1);
        expect(w.lines.join('\n')).not.toContain(SENTINEL_TOKEN);
    });

    it('a stored token that cannot be read leaves it idle and listed failed: the app starts', async () => {
        const store = await storedWorld('discord', {
            settings: { applicationId: APP_ID, guilds: [GUILD] },
            secrets: { set: { token: SENTINEL_TOKEN } },
        }, createKeyring([{ id: 'k1', key: randomBytes(32) }]));
        // the application id from env: a token only the unreadable row holds is no deployment error
        const w = world({ moduleEnv: { DISCORD_APPLICATION_ID: APP_ID }, store });

        await w.harness.setup();

        const channel = w.channels().find((item) => item.name === 'discord');

        expect(w.clients.clients).toEqual([]);
        expect(channel?.start).toBeUndefined();
        await expect(channel?.out?.({} as never, 'address', {} as never))
            .rejects.toBeInstanceOf(ConnectionNotConfiguredError);
        expect(w.connection().resolved).toMatchObject({
            state: 'failed',
            reason: expect.stringContaining('decryption_failed'),
        });
        expect(w.lines.join('\n')).not.toContain(SENTINEL_TOKEN);
    });

    it('stored settings without PUBLIC_URL stay idle, env settings fail', async () => {
        const store = await storedWorld('discord', {
            settings: { applicationId: APP_ID, guilds: [GUILD] },
            secrets: { set: { token: 'stored-token' } },
        });
        const stored = world({
            moduleEnv: {},
            store,
            patch: { approvalUrl: undefined },
        });

        await stored.harness.setup();
        expect(stored.clients.clients).toEqual([]);
        expect(stored.connection().resolved.state).toBe('incomplete');
        expect(stored.connection().resolved.reason).toContain('PUBLIC_URL');

        const env = world({ patch: { approvalUrl: undefined } });

        await expect(env.harness.setup()).rejects.toThrow(/PUBLIC_URL/);
    });

    it('an env deployment with an old row still fails without PUBLIC_URL', async () => {
        const store = await storedWorld('discord', { settings: { applicationId: 'old-row' } });
        const w = world({ store, patch: { approvalUrl: undefined } });

        await expect(w.harness.setup()).rejects.toThrow(/PUBLIC_URL/);
    });

    it('a complete env deployment fails without PUBLIC_URL although a row stores an optional field', async () => {
        const store = await storedWorld('discord', { settings: { roles: [ROLE] } });
        const w = world({ store, patch: { approvalUrl: undefined } });

        await expect(w.harness.setup()).rejects.toThrow(/PUBLIC_URL/);
    });

    it.each([
        [{ apiUrl: 'ftp://nope' }, /apiUrl/],
        [{ userName: '' }, /userName/],
    ])('a refused code option %j fails the start although the connection is stored', async (patch, message) => {
        const store = await storedWorld('discord', {
            settings: { applicationId: APP_ID, guilds: [GUILD] },
            secrets: { set: { token: 'stored-token' } },
        });
        const w = world({
            moduleEnv: {},
            store,
            patch,
        });

        await expect(w.harness.setup()).rejects.toThrow(message);
    });

    it('a refused stored field next to a complete env leaves it idle and repairable', async () => {
        const store = await storedWorld('discord', { settings: { roles: ['not-an-id'] } });
        const w = world({ store });

        await w.harness.setup();

        expect(w.clients.clients).toEqual([]);
        expect(w.connection().resolved.state).toBe('incomplete');
        expect(w.connection().resolved.reason).toContain('policy.roles');
    });

    it('a store without connections is env-only and read-only', async () => {
        const store = storeOf({ connections: false });

        const w = world({ moduleEnv: {}, store });

        await w.harness.setup();

        expect(w.connection().editable).toBe(false);
        expect(w.connection().resolved.state).toBe('not_configured');
    });

    it('passes answers through to the channel, which checks them', async () => {
        await expect(world({ patch: { answers: {} } }).harness.setup()).resolves.toBeUndefined();
        await expect(world({ patch: { answers: { timeoutMs: 0 } } }).harness.setup()).rejects.toThrow(/answers\.timeoutMs/);
    });

    it('migrate mode does nothing', async () => {
        const w = world({
            mode: 'migrate',
            store: storeOf(),
            appEnv: { DATABASE_URL: 'postgres://chamvi@127.0.0.1:1/chamvi' },
        });

        await w.harness.setup();

        expect(w.channels()).toEqual([]);
        expect(w.providers()).toEqual([]);
    });
});
