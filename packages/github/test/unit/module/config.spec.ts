/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
    ConnectionNotConfiguredError,
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
import { createGithubApp, github, injectGithubContext } from '@chamvi/github';
import { ControllableClock, createFakeGithub } from '@chamvi/test-kit';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import {
    AppToken,
    configModule,
    engineModule,
    httpModule,
    staticTokensModule,
    storeModule,
} from '@chamvi/app';
import type { IContainer, IModule } from '@chamvi/app';
import { createModuleHarness } from '@chamvi/app/testing';
import type { ModuleHarness } from '@chamvi/app/testing';
import { GITHUB_CONNECTION_TYPE, githubModule } from '@chamvi/github/module';
import { githubConnectionDefinition } from '../../../src/module/type.ts';
import { mockModel, textModel } from '../../utils/model.ts';
import {
    TOKENS,
    createRecordingLogger,
    freePort,
} from '../../utils/module.ts';
import type { RecordingLogger } from '../../utils/module.ts';

const clock = new ControllableClock(new Date('2026-10-20T10:00:00Z'));
const fake = createFakeGithub({ appId: '1', clock });
const keyring = createKeyring([{ id: 'k1', key: randomBytes(32) }]);

const harnesses: ModuleHarness[] = [];

afterEach(async () => {
    for (const harness of harnesses.splice(0)) {
        await harness.stop();
    }
});

const ISSUES_OPENED = readFileSync(new URL('../../fixtures/deliveries/issues-opened.json', import.meta.url), 'utf8');

function sign(body: string, secret: string): string {
    return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

function deliver(port: number, channel: string, secret: string, delivery: string): Promise<Response> {
    return fetch(`http://127.0.0.1:${port}/channels/${channel}`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-github-event': 'issues',
            'x-github-delivery': delivery,
            'x-hub-signature-256': sign(ISSUES_OPENED, secret),
        },
        body: ISSUES_OPENED,
    });
}

/** The modules over real HTTP on a free port. */
async function serve(modules: IModule[], agents: Agent[]): Promise<{ harness: ModuleHarness; port: number }> {
    const port = await freePort();
    const harness = await createModuleHarness({
        env: {
            CHAMVI_TOKENS: TOKENS,
            HOST: '127.0.0.1',
            PORT: String(port),
        },
        keyring,
        agents,
        modules: [
            configModule({ logger: createRecordingLogger() }),
            storeModule(),
            staticTokensModule(),
            engineModule(),
            httpModule({ metrics: false, rateLimit: false }),
            ...modules,
        ],
    });

    harnesses.push(harness);

    return { harness, port };
}

function agentNamed(name: string, channels: Agent['definition']['channels'] = []): Agent {
    return defineModelAgent({
        name,
        instructions: name,
        model: textModel(),
        channels,
    });
}

async function setup(
    modules: IModule[],
    input: {
        agents?: Agent[]; 
        store?: IStore; 
        logger?: RecordingLogger 
    } = {},
): Promise<ModuleHarness> {
    const harness = await createModuleHarness({
        env: {},
        keyring,
        agents: input.agents ?? [],
        modules: [
            configModule({ logger: input.logger ?? createRecordingLogger() }),
            storeModule(input.store ? { store: input.store } : {}),
            engineModule(),
            ...modules,
        ],
    });

    harnesses.push(harness);

    return harness;
}

function connectionsOf(harness: ModuleHarness): readonly DeclaredConnection[] {
    return harness.container.resolveAll(AppToken.CONNECTION_TYPES).flatMap((provider: IConnectionTypeProvider) => [...provider.connections()]);
}

function envOf(prefix: string): Record<string, string> {
    return {
        [`${prefix}APP_ID`]: '1',
        [`${prefix}APP_PRIVATE_KEY`]: fake.privateKey,
        [`${prefix}WEBHOOK_SECRET`]: 'a',
    };
}

describe('githubConnectionDefinition', () => {
    it('declares the private key multi-line, so a pasted PEM keeps its newlines', () => {
        expect(githubConnectionDefinition().fields.find((field) => field.key === 'privateKey')).toMatchObject({ multiline: true });
    });
});

describe('githubModule configuration', () => {
    it('two modules targeting one agent fail at startup', async () => {
        const agents = [agentNamed('triager')];

        await expect(setup([
            githubModule({
                name: 'one',
                agents: ['triager'],
                env: {},
            }),
            githubModule({
                name: 'two',
                agents: ['triager'],
                env: {},
            }),
        ], { agents })).rejects.toThrow(/triager/);
    });

    it('two modules without agents fail at startup', async () => {
        await expect(setup([
            githubModule({ name: 'one', env: {} }),
            githubModule({ name: 'two', env: {} }),
        ])).rejects.toThrow(InvalidAgentDefinitionError);
    });

    it('a name in agents matching no agent warns', async () => {
        const logger = createRecordingLogger();

        await setup([githubModule({
            name: 'acme',
            agents: ['ghost'],
            env: {},
        })], { logger, agents: [agentNamed('other')] });

        expect(logger.entries.find((entry) => entry.level === 'warn' && String(entry.msg).includes('ghost'))).toBeDefined();
    });

    it('a subscriber outside the module\'s agents is refused', async () => {
        const agents = [agentNamed('outsider', [github.on('issues.opened')])];

        await expect(setup([
            githubModule({ agents: ['triager'], env: envOf('GITHUB_') }),
        ], { agents })).rejects.toThrow(/outsider/);
    });

    it('a subscriber inside the module\'s agents is accepted', async () => {
        const agents = [agentNamed('triager', [github.on('issues.opened')])];

        await expect(setup([
            githubModule({ agents: ['triager'], env: envOf('GITHUB_') }),
        ], { agents })).resolves.toBeDefined();
    });

    it('a named module reads CHAMVI_GITHUB_ACME_APP_ID', async () => {
        const module = githubModule({ name: 'acme', env: envOf('CHAMVI_GITHUB_ACME_') });

        await setup([module]);

        expect(module.name).toBe('chamvi:github:acme');
        expect(module.app.appId).toBe('1');
    });

    it('a named module defaults its channel to its name', async () => {
        const harness = await setup([githubModule({ name: 'acme', env: envOf('CHAMVI_GITHUB_ACME_') })]);

        expect(harness.container.resolveAll(AppToken.CHANNELS).map((channel) => channel.name)).toContain('acme');
    });

    it('channel.name wins over name', async () => {
        const harness = await setup([githubModule({
            name: 'acme',
            env: envOf('CHAMVI_GITHUB_ACME_'),
            channel: { name: 'custom' },
        })]);
        const names = harness.container.resolveAll(AppToken.CHANNELS).map((channel) => channel.name);

        expect(names).toContain('custom');
        expect(names).not.toContain('acme');
    });

    it('the default reads GITHUB_APP_ID unchanged', async () => {
        const module = githubModule({ env: envOf('GITHUB_') });

        await setup([module]);

        expect(module.name).toBe('chamvi:github:github');
        expect(module.app.appId).toBe('1');
    });

    it('GITHUB_APP_ID set with no private key anywhere fails naming GITHUB_APP_PRIVATE_KEY', async () => {
        await expect(setup([githubModule({ env: { GITHUB_APP_ID: '1', GITHUB_WEBHOOK_SECRET: 'a' } })]))
            .rejects.toThrow(/GITHUB_APP_PRIVATE_KEY/);
    });

    it('nothing set starts idle and webhooks answer 503', async () => {
        const logger = createRecordingLogger();
        const port = await freePort();
        const harness = await createModuleHarness({
            env: {
                CHAMVI_TOKENS: TOKENS,
                HOST: '127.0.0.1',
                PORT: String(port),
            },
            keyring,
            agents: [agentNamed('triage', [github.on('issues.opened')])],
            modules: [
                configModule({ logger }),
                storeModule(),
                staticTokensModule(),
                engineModule(),
                httpModule({ metrics: false, rateLimit: false }),
                githubModule({ env: {} }),
            ],
        });

        harnesses.push(harness);

        expect(harness.reported).toEqual([]);
        expect(logger.entries.some((entry) => entry.level === 'warn' && String(entry.msg).includes('not configured'))).toBe(true);
        expect(connectionsOf(harness)[0]).toMatchObject({
            name: GITHUB_CONNECTION_TYPE, 
            editable: true, 
            deletable: false, 
        });
        expect(connectionsOf(harness)[0]!.resolved.state).toBe('not_configured');

        const response = await fetch(`http://127.0.0.1:${port}/channels/github`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-github-event': 'issues',
                'x-github-delivery': 'd-1',
                'x-hub-signature-256': 'sha256=00',
            },
            body: '{}',
        });

        expect(response.status).toBe(503);
    });

    it('.app before configuration throws ConnectionNotConfiguredError on use, not on access', async () => {
        const module = githubModule({ env: {} });
        const { app } = module;

        expect(() => app.appId).toThrow(ConnectionNotConfiguredError);
        expect(() => app.verifySignature(new Uint8Array(), null)).toThrow(ConnectionNotConfiguredError);
        await expect(app.botLogin()).rejects.toBeInstanceOf(ConnectionNotConfiguredError);
    });

    it('a stored connection configures the module and carries its revision', async () => {
        const store = createMemoryStore({ clock });
        const configs = createConnectionConfigStore({ store, keyring: () => keyring });

        await configs.create('github', GITHUB_CONNECTION_TYPE, {
            settings: { appId: '7' },
            secrets: { set: { privateKey: fake.privateKey, webhookSecret: 'stored' } },
        });

        const module = githubModule({ env: {} });
        const harness = await setup([module], { store });
        const [connection] = connectionsOf(harness);
        const row = await store.connections!.findOne('github');

        expect(module.app.appId).toBe('7');
        expect(connection).toMatchObject({
            name: 'github',
            editable: true,
            deletable: false,
            loadedRevision: (await configs.read('github'))!.revision,
            loadedCreatedAt: row!.createdAt,
        });
        expect(connection!.resolved.sources.appId).toEqual({ kind: 'store' });
    });

    it('a stored connection with a refused value stays idle and is listed incomplete', async () => {
        const store = createMemoryStore({ clock });
        const configs = createConnectionConfigStore({ store, keyring: () => keyring });

        await configs.create('github', GITHUB_CONNECTION_TYPE, {
            settings: { appId: '7' },
            secrets: { set: { privateKey: 'not-a-key', webhookSecret: 'stored' } },
        });

        const logger = createRecordingLogger();
        const module = githubModule({ env: {} });
        const harness = await setup([module], { store, logger });

        expect(() => module.app.appId).toThrow(ConnectionNotConfiguredError);
        expect(connectionsOf(harness)[0]!.resolved.state).toBe('incomplete');
        expect(logger.lines.join('\n')).not.toContain('not-a-key');
    });

    it('a refused stored optional value is dropped: required stored values stay and the App starts', async () => {
        const store = createMemoryStore({ clock });
        const configs = createConnectionConfigStore({ store, keyring: () => keyring });

        await configs.create('github', GITHUB_CONNECTION_TYPE, {
            settings: { appId: '7', slug: 'Not A Slug' },
            secrets: { set: { privateKey: fake.privateKey, webhookSecret: 'stored' } },
        });

        const logger = createRecordingLogger();
        const module = githubModule({ env: { GITHUB_API_URL: 'https://ghe.example.com/api/v3' } });
        const harness = await setup([module], { store, logger });
        const { resolved } = connectionsOf(harness)[0]!;

        expect(module.app.appId).toBe('7');
        expect(resolved.state).toBe('incomplete');
        expect(resolved.missing).toEqual([]);
        expect(resolved.values.slug).toBeUndefined();
        expect(resolved.sources.slug).toEqual({ kind: 'unset' });
        expect(logger.lines.join('\n')).not.toContain('Not A Slug');
    });

    it('a refused stored required value with env set stays idle, listing only it as missing', async () => {
        const store = createMemoryStore({ clock });
        const configs = createConnectionConfigStore({ store, keyring: () => keyring });

        await configs.create('github', GITHUB_CONNECTION_TYPE, {
            settings: { appId: '7' },
            secrets: { set: { privateKey: 'not-a-key', webhookSecret: 'stored' } },
        });

        const module = githubModule({ env: { GITHUB_API_URL: 'https://ghe.example.com/api/v3' } });
        const harness = await setup([module], { store });
        const { resolved } = connectionsOf(harness)[0]!;

        expect(() => module.app.appId).toThrow(ConnectionNotConfiguredError);
        expect(resolved.state).toBe('incomplete');
        expect(resolved.missing).toEqual(['privateKey']);
        expect(resolved.values.appId).toBe('7');
    });

    it('several refused stored values are all dropped', async () => {
        const store = createMemoryStore({ clock });
        const configs = createConnectionConfigStore({ store, keyring: () => keyring });

        await configs.create('github', GITHUB_CONNECTION_TYPE, {
            settings: {
                appId: '7',
                slug: 'Not A Slug',
                baseUrl: 'http://plain.example',
            },
            secrets: { set: { privateKey: fake.privateKey, webhookSecret: 'stored' } },
        });

        const module = githubModule({ env: {} });
        const harness = await setup([module], { store });

        expect(module.app.appId).toBe('7');
        expect(connectionsOf(harness)[0]!.resolved.missing).toEqual([]);
    });

    it('a refused value that did not come from the store fails the start, even with a stored row', async () => {
        const store = createMemoryStore({ clock });
        const configs = createConnectionConfigStore({ store, keyring: () => keyring });

        await configs.create('github', GITHUB_CONNECTION_TYPE, {
            settings: { appId: '7' },
            secrets: { set: { privateKey: fake.privateKey, webhookSecret: 'stored' } },
        });

        await expect(setup([githubModule({ slug: 'Not A Slug', env: {} })], { store })).rejects.toThrow(InvalidAgentDefinitionError);
    });

    it('a refused value from a variable file fails naming the variable, never the value', async () => {
        const file = path.join(mkdtempSync(path.join(tmpdir(), 'chamvi-github-')), 'slug');

        writeFileSync(file, 'Secret Slug');

        const error = await setup([githubModule({ env: { ...envOf('GITHUB_'), GITHUB_APP_SLUG_FILE: file } })]).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(InvalidAgentDefinitionError);
        expect((error as Error).message).toContain('GITHUB_APP_SLUG');
        expect((error as Error).message).not.toContain('Secret Slug');
    });

    it('a named instance takes deliveries under its own webhook secret and refuses the default\'s', async () => {
        const { port } = await serve([
            githubModule({ env: { ...envOf('GITHUB_'), GITHUB_WEBHOOK_SECRET: 'default-secret' } }),
            githubModule({
                name: 'acme',
                agents: ['triager'],
                env: {
                    ...envOf('CHAMVI_GITHUB_ACME_'), 
                    CHAMVI_GITHUB_ACME_WEBHOOK_SECRET: 'acme-secret', 
                    CHAMVI_GITHUB_ACME_APP_SLUG: 'acme', 
                },
            }),
        ], [agentNamed('triager')]);

        expect((await deliver(port, 'acme', 'acme-secret', 'd-acme')).status).toBe(202);
        expect((await deliver(port, 'acme', 'default-secret', 'd-other')).status).toBe(401);
    });

    it('a run from another App\'s channel uses its own App\'s installation, not the delivery\'s', async () => {
        const fallbackFake = createFakeGithub({ appId: '1', clock });
        const acmeFake = createFakeGithub({ appId: '2', clock });

        acmeFake.installations.set('octo/demo', 77);
        acmeFake.issues.set('octo/demo#7', {
            number: 7, 
            title: 'Hello', 
            state: 'open', 
        });

        const triager = defineModelAgent({
            name: 'triager',
            instructions: 'triage',
            model: mockModel([
                {
                    parts: [{
                        type: 'tool-call',
                        toolName: 'github_get_issue',
                        input: { repo: 'octo/demo', number: 7 },
                    }],
                },
                { parts: [{ type: 'text', text: 'done' }] },
            ]),
            channels: [github.on('issues.opened')],
            tools: (ctx) => injectGithubContext(ctx).readTools(),
        });
        const { harness, port } = await serve([
            githubModule({
                env: {},
                appId: '1',
                privateKey: fallbackFake.privateKey,
                webhookSecret: 'fallback-secret',
                slug: 'fallback',
                clock,
                fetch: fallbackFake.fetch,
            }),
            githubModule({
                name: 'acme',
                agents: ['triager'],
                env: {
                    CHAMVI_GITHUB_ACME_APP_ID: '2',
                    CHAMVI_GITHUB_ACME_APP_PRIVATE_KEY: acmeFake.privateKey,
                    CHAMVI_GITHUB_ACME_WEBHOOK_SECRET: 'acme-secret',
                },
                clock,
                fetch: acmeFake.fetch,
            }),
        ], [triager]);
        const engine = harness.container.resolve(AppToken.ENGINE);

        expect((await deliver(port, 'github', 'fallback-secret', 'd-cross')).status).toBe(202);
        await engine.idle();

        const exchanges = (requests: { path: string }[]) => requests.map((r) => r.path).filter((p) => p.endsWith('/access_tokens'));

        expect(exchanges(acmeFake.requests)).toEqual(['/app/installations/77/access_tokens']);
        expect(exchanges(fallbackFake.requests)).toEqual([]);
    });

    it('app option: listed, not editable', async () => {
        const app = createGithubApp({
            appId: '9',
            privateKey: fake.privateKey,
            webhookSecret: 'a',
            clock,
            fetch: fake.fetch,
        });
        const harness = await setup([githubModule({ app, env: {} })]);
        const [connection] = connectionsOf(harness);

        expect(connection).toMatchObject({
            name: 'github',
            editable: false,
            deletable: false,
        });
        expect(connection!.resolved.state).toBe('configured');
        expect(connection!.resolved.values.privateKey).toBeUndefined();
    });

    it('only the fallback contributes git credentials unless credentials is set', async () => {
        const harness = await setup([
            githubModule({ env: envOf('GITHUB_') }),
            githubModule({
                name: 'acme',
                agents: ['triager'],
                env: envOf('CHAMVI_GITHUB_ACME_'),
            }),
        ]);

        expect(harness.container.resolveAll(AppToken.GIT_CREDENTIALS)).toHaveLength(1);

        const optedIn = await setup([
            githubModule({ env: envOf('GITHUB_'), credentials: false }),
            githubModule({
                name: 'acme',
                agents: ['triager'],
                env: envOf('CHAMVI_GITHUB_ACME_'),
                credentials: {},
            }),
        ]);

        expect(optedIn.container.resolveAll(AppToken.GIT_CREDENTIALS)).toHaveLength(1);
    });

    it('an unconfigured module contributes no git credentials', async () => {
        const harness = await setup([githubModule({ env: {} })]);

        expect(harness.container.resolveAll(AppToken.GIT_CREDENTIALS)).toEqual([]);
    });

    it('migrate mode reads nothing and contributes nothing', async () => {
        // only the context is read: a partial env must not fail a migration
        const container = { resolve: () => ({ mode: 'migrate' }) } as unknown as IContainer;

        await expect(githubModule({ env: { GITHUB_APP_ID: '1' } }).setup(container)).resolves.toBeUndefined();
    });

    it('a store without connections stays env-only and not editable', async () => {
        const store: IStore = { ...createMemoryStore({ clock }), connections: undefined };
        const module = githubModule({ env: envOf('GITHUB_') });
        const harness = await setup([module], { store });

        expect(connectionsOf(harness)[0]).toMatchObject({ name: 'github', editable: false });
        expect(module.app.appId).toBe('1');
    });

    it('lists one connection type for several modules', async () => {
        const harness = await setup([
            githubModule({ env: envOf('GITHUB_') }),
            githubModule({
                name: 'acme',
                agents: ['triager'],
                env: envOf('CHAMVI_GITHUB_ACME_'),
            }),
        ]);
        const providers = harness.container.resolveAll(AppToken.CONNECTION_TYPES);

        expect(providers).toHaveLength(1);
        expect(providers[0]!.definition.multiple).toBe(false);
        expect(connectionsOf(harness).map((connection) => connection.name)).toEqual(['github', 'acme']);
    });
});
