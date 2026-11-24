/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readFileSync } from 'node:fs';
import {
    describe,
    expect,
    expectTypeOf,
    it,
} from 'vitest';
import { TypedToken } from 'eldin';
import * as app from '@chamvi/app';
import * as authup from '@chamvi/app/authup';
import * as testing from '@chamvi/app/testing';
import type {
    AppCheckOptions,
    AppCheckResult,
    AppStartOptions,
    IApp,
} from '@chamvi/app';
import type { AgentIssue } from '@chamvi/http';
import type { PermissionBinding } from '@chamvi/access';
import * as store from '@chamvi/store';

describe('public api', () => {
    it.each([
        'createApp',
        'isApp',
        'readConfig',
        'readKeyring',
        'approvalUrlOf',
        'createLogger',
        'readStoredConnections',
        'resolveStoredConnection',
        'readUiAuth',
        'runHooks',
        'throwIfStopped',
        'envString',
        'envInteger',
        'envBoolean',
        'envUrl',
        'envList',
        'envJson',
        'envOneOf',
        'envSecret',
        'loadAgent',
        'loadAgents',
        'hashAgentFolder',
        'listAgentFolders',
        'loadAgentPackage',
        'hashAgentPackage',
        'configModule',
        'storeModule',
        'staticTokensModule',
        'consoleChannelModule',
        'uiPageModule',
        'engineModule',
        'agentsModule',
        'schedulerModule',
        'componentsModule',
        'ComponentsModule',
        'httpModule',
        // a database for an app's own tables
        'databaseModule',
        'DatabaseModule',
        'dataSourceToken',
        'readDatabaseDescriptors',
        // the helpers of an app's own controllers, from @chamvi/http
        'usePrincipal',
        'authorizeRequest',
        'assertGranted',
        'toInvoker',
        'ForceLoggedInMiddleware',
        'JsonBodyMiddleware',
        'RequiredJsonBodyMiddleware',
        // the list schema of an app's list endpoints and its decoder, from @chamvi/http
        'defineSchema',
        'decodeQuery',
        'scopeQuery',
        // the common surface of @chamvi/core and @chamvi/http
        'defineModelAgent',
        'defineSimpleAgent',
        'approve',
        'defineTool',
        'defineEffectTool',
        'effectMarker',
        'requireToolPermission',
        'consoleChannel',
        'defineContextKey',
        'inject',
        'tryInject',
        // @chamvi/access
        'can',
        'canSome',
        'isPermissionBinding',
        'isPermissionAuthorization',
        'allPermissions',
        'permissionNames',
        'resolveModel',
        'checkAgentModel',
        'agentChannel',
        'dispatch',
    ])('exports %s', (name) => {
        expect(app).toHaveProperty(name);
        expect(app[name as keyof typeof app]).toBeTypeOf('function');
    });

    it('exports the dispatch role builder and the agent channel name', () => {
        expect(app.agent.on).toBeTypeOf('function');
        expect(app.agent.on()).toMatchObject({ channel: 'agent', id: 'default' });
        expect(app.AGENT_CHANNEL_NAME).toBe('agent');
    });

    it('exports the stored record types and the read normalizers of @chamvi/store', () => {
        expect(app.RunStatus).toBe(store.RunStatus);
        expect(app.normalizeEnvelope).toBe(store.normalizeEnvelope);
        expect(app.normalizeWaitPoint).toBe(store.normalizeWaitPoint);
        expectTypeOf<app.Run>().toEqualTypeOf<store.Run>();
        expectTypeOf<app.TriggerEnvelope>().toEqualTypeOf<store.TriggerEnvelope>();
        expectTypeOf<app.Invoker>().toEqualTypeOf<store.Invoker>();
    });

    it.each(['createModelRegistry', 'installDefaultProvider', 'resolveModels'])('does not export %s', (name) => {
        expect(app).not.toHaveProperty(name);
    });

    it.each(['cron', 'http', 'webhook'])('exports the %s subscription builder', (name) => {
        const builder = app[name as 'cron' | 'http' | 'webhook'];

        expect(builder.on).toBeTypeOf('function');
    });

    it('drops what channels replaced', () => {
        for (const name of ['consoleNotifierModule', 'consoleNotifier']) {
            expect(app).not.toHaveProperty(name);
        }
    });

    it('exports the database tokens, apart from chamvi\'s own data source token', () => {
        expect(Object.keys(app.DatabaseToken).sort()).toEqual(['DATA_SOURCE', 'DESCRIPTORS']);
        expect(app.DatabaseToken.DATA_SOURCE).toBe(app.dataSourceToken());
        expect(app.DatabaseToken.DATA_SOURCE).not.toBe(app.AppToken.DATA_SOURCE);
    });

    it('exports the keyring variable', () => {
        expect(app.ENV_ENCRYPTION_KEYS).toBe('CHAMVI_ENCRYPTION_KEYS');
    });

    it('exports the timer limit of the ms variables', () => {
        expect(app.TIMER_MAX_MS).toBe(2_147_483_647);
    });

    it('exports the default poll interval of the agents dir', () => {
        expect(app.DEFAULT_AGENTS_POLL_MS).toBe(5_000);
    });

    it('exports the tokens', () => {
        expect(Object.keys(app.AppToken).sort()).toEqual([
            'AGENT_CHECKS',
            'AGENT_ISSUES',
            'AGENT_REVISION_REPOSITORY',
            'AGENT_REVISION_SERVICE',
            'ARTIFACT_REPOSITORY',
            'ARTIFACT_SERVICE',
            'AUTHENTICATORS',
            'CHANNELS',
            'CHECKPOINT_REPOSITORY',
            'CHECKPOINT_SERVICE',
            'CLOCK',
            'COMPONENTS',
            'COMPONENT_LIST',
            'CONFIG',
            'CONNECTIONS',
            'CONNECTION_CONFIGS',
            'CONNECTION_REPOSITORY',
            'CONNECTION_SERVICE',
            'CONNECTION_TYPES',
            'CONTEXT',
            'CONVERSATION_REPOSITORY',
            'CONVERSATION_SERVICE',
            'DATA_SOURCE',
            'EFFECT_REPOSITORY',
            'EFFECT_SERVICE',
            'ENGINE',
            'GIT_CREDENTIALS',
            'HTTP_CONTROLLERS',
            'HTTP_ROUTES',
            'IDEMPOTENCY_REPOSITORY',
            'IDEMPOTENCY_SERVICE',
            'KEYRING',
            'LIFECYCLE_HOOKS',
            'LIMIT_REPOSITORY',
            'LIMIT_SERVICE',
            'LOCK_REPOSITORY',
            'LOCK_SERVICE',
            'LOGGER',
            'MODELS',
            'OPENAPI_DOCUMENTS',
            'PEERS',
            'RUN_REPOSITORY',
            'RUN_SERVICE',
            'SERVER',
            'SHUTDOWN',
            'STATE_DOCUMENT_REPOSITORY',
            'STATE_REPOSITORY',
            'STATE_SERVICE',
            'STEP_REPOSITORY',
            'STEP_SERVICE',
            'STORE_KIND',
            'UI_AUTH',
            'UI_PAGES',
        ]);
    });

    it('exports eldin\'s TypedToken, so a feature module keys the container with the class it compares against', () => {
        expect(app.TypedToken).toBe(TypedToken);
    });

    it('exports the module names and codes', () => {
        expect(app.ModuleName).toEqual({
            CONFIG: 'chamvi:config',
            STORE: 'chamvi:store',
            STATIC_TOKENS: 'chamvi:static-tokens',
            ENGINE: 'chamvi:engine',
            AGENTS: 'chamvi:agents',
            SCHEDULER: 'chamvi:scheduler',
            COMPONENTS: 'chamvi:components',
            HTTP: 'chamvi:http',
            CONSOLE: 'chamvi:console',
            UI: 'chamvi:ui',
        });
        expect(app.APP_ERROR_CODE).toEqual({
            STOPPED: 'app_stopped',
            IN_USE: 'app_in_use',
            STOP_FAILED: 'app_stop_failed',
            STORE_NOT_MIGRATED: 'store_not_migrated',
            PACKAGE_AGENT_FAILED: 'package_agent_failed',
        });
        expect(app.AUTHENTICATOR_ORDER).toEqual({
            STATIC_TOKENS: 0,
            AUTHUP: 10,
            OIDC: 20,
        });
    });

    it('exports the built-in providers', () => {
        expect(app.BUILTIN_PROVIDERS.map((provider) => provider.id).sort()).toEqual([
            'anthropic',
            'google',
            'mistral',
            'openai',
            'xai',
        ]);
    });

    it('exports the check types', () => {
        expectTypeOf<IApp['check']>().returns.resolves.toEqualTypeOf<AppCheckResult>();
        expectTypeOf<AppCheckResult>().toEqualTypeOf<{ issues: AgentIssue[] }>();
        expectTypeOf<AppCheckOptions>().toEqualTypeOf<AppStartOptions>();
        expect(app.createApp({}).check).toBeTypeOf('function');
        expect(app.createApp({})).not.toHaveProperty('inspect');
    });

    it.each(['createSkillCatalog', 'defineSkill', 'defineSkillSource', 'hashSkillBundle', 'loadSkillBundle', 'loadSkillBundles', 'gitSkills', 'readSkillBundle', 'parseSkillDocument', 'SKILL_MAX_BUNDLES'])('keeps skill internal %s private', (name) => {
        expect(app).not.toHaveProperty(name);
    });

    it('exports the app brand', () => {
        expect(app.APP_BRAND).toBe(Symbol.for('chamvi.app'));
        expect(app.APP_MODULES).toBe(Symbol.for('chamvi.app.modules'));
    });

    it('exports the permission names of @chamvi/access', () => {
        expect(app.Permission.AGENT_READ).toBe('chamvi_agent_read');
        expect(app.PERMISSION_NAMES).toHaveLength(14);
        expectTypeOf<app.PermissionBinding>().toEqualTypeOf<PermissionBinding>();
    });

    it.each(['agentPermission', 'hasPermission', 'matchesPermission', 'toolPermission', 'PERMISSION_ALL'])('drops the string permission helper %s', (name) => {
        expect(app).not.toHaveProperty(name);
    });

    it.each([
        ['authup', authup, ['authupModule', 'oidcModule']],
    ] as const)('@chamvi/app/%s exports its modules', (_, entry, names) => {
        for (const name of names) {
            expect(entry).toHaveProperty(name);
            expect((entry as Record<string, unknown>)[name]).toBeTypeOf('function');
        }
    });

    it('@chamvi/app/authup exports the default server client name', () => {
        expect(authup.AUTHUP_CLIENT_ID_DEFAULT).toBe('chamvi-server');
    });

    it.each([
        'reportingModule',
        'createPurgeTimer',
        'createAgentsWatcher',
        'createLazyProvider',
        'githubModule',
        'githubChannel',
        'openclawModule',
        'openclawChannel',
        'sandboxModule',
        'uiModule',
        'buildModuleHarness',
        'createModuleHarness',
    ])('keeps %s out of the main entry', (name) => {
        expect(app).not.toHaveProperty(name);
    });

    it.each([
        'buildModuleHarness',
        'createModuleHarness',
        'memoryStoreModule',
    ])('@chamvi/app/testing exports %s', (name) => {
        expect(testing).toHaveProperty(name);
        expect(testing[name as keyof typeof testing]).toBeTypeOf('function');
    });

    it('@chamvi/app/testing takes no record of repositories', () => {
        expectTypeOf<Parameters<typeof testing.memoryStoreModule>>().toEqualTypeOf<[options?: testing.MemoryStoreModuleOptions]>();
        expectTypeOf<keyof testing.MemoryStoreModuleOptions>().toEqualTypeOf<'registry' | 'connections' | 'conversations'>();
    });

    it('takes a store module of a URL or a data source only', () => {
        expectTypeOf<keyof app.StoreModuleOptions>().toEqualTypeOf<'url' | 'dataSource'>();
    });
});

describe('package.json', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
        exports: Record<string, unknown>,
        dependencies?: Record<string, string>,
        devDependencies?: Record<string, string>,
        peerDependencies?: Record<string, string>,
        peerDependenciesMeta?: Record<string, { optional?: boolean }>,
    };

    it('exports only the main, authup and testing entries', () => {
        expect(Object.keys(pkg.exports).sort()).toEqual(['.', './authup', './package.json', './testing']);
    });

    it('names no feature package in the dependency fields', () => {
        const feature = /^@chamvi\/(github|channel-openclaw|sandbox(-.+)?|ui)$/;
        const names = [
            ...Object.keys(pkg.dependencies ?? {}),
            ...Object.keys(pkg.devDependencies ?? {}),
            ...Object.keys(pkg.peerDependencies ?? {}),
        ];

        expect(names.filter((name) => feature.test(name))).toEqual([]);
    });

    it('declares only the model providers and authup as optional peers', () => {
        const optional = Object.entries(pkg.peerDependenciesMeta ?? {})
            .filter(([, meta]) => meta.optional)
            .map(([name]) => name)
            .sort();

        expect(optional).toEqual([
            '@ai-sdk/anthropic',
            '@ai-sdk/google',
            '@ai-sdk/mistral',
            '@ai-sdk/openai',
            '@ai-sdk/openai-compatible',
            '@ai-sdk/xai',
            '@authup/core-http-kit',
            '@authup/server-adapter-kit',
        ]);
    });
});
