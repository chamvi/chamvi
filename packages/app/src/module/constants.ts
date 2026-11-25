/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { TypedToken } from 'eldin';
import type { AppTokens } from './types.ts';

function token<K extends keyof AppTokens>(key: K): TypedToken<AppTokens[K]> {
    return new TypedToken<AppTokens[K]>(`chamvi.${key.toLowerCase().replace(/_/g, '-')}`);
}

/**
 * The container keys modules share. `HTTP_ROUTES`, `HTTP_CONTROLLERS`,
 * `OPENAPI_DOCUMENTS`, `AUTHENTICATORS`, `CHANNELS`, `COMPONENTS`,
 * `CONNECTIONS`, `CONNECTION_TYPES`, `UI_PAGES`, `LIFECYCLE_HOOKS`,
 * `AGENT_CHECKS` and `GIT_CREDENTIALS` are collections (`registerMany` in `setup`, `resolveAll`
 * in `onReady`); every other token holds one value.
 */
export const AppToken = {
    CONTEXT: token('CONTEXT'),
    CONFIG: token('CONFIG'),
    LOGGER: token('LOGGER'),
    CLOCK: token('CLOCK'),
    STORE_KIND: token('STORE_KIND'),
    RUN_REPOSITORY: token('RUN_REPOSITORY'),
    RUN_SERVICE: token('RUN_SERVICE'),
    STEP_REPOSITORY: token('STEP_REPOSITORY'),
    STEP_SERVICE: token('STEP_SERVICE'),
    CHECKPOINT_REPOSITORY: token('CHECKPOINT_REPOSITORY'),
    CHECKPOINT_SERVICE: token('CHECKPOINT_SERVICE'),
    EFFECT_REPOSITORY: token('EFFECT_REPOSITORY'),
    EFFECT_SERVICE: token('EFFECT_SERVICE'),
    ARTIFACT_REPOSITORY: token('ARTIFACT_REPOSITORY'),
    ARTIFACT_SERVICE: token('ARTIFACT_SERVICE'),
    STATE_REPOSITORY: token('STATE_REPOSITORY'),
    STATE_DOCUMENT_REPOSITORY: token('STATE_DOCUMENT_REPOSITORY'),
    STATE_SERVICE: token('STATE_SERVICE'),
    LOCK_REPOSITORY: token('LOCK_REPOSITORY'),
    LOCK_SERVICE: token('LOCK_SERVICE'),
    IDEMPOTENCY_REPOSITORY: token('IDEMPOTENCY_REPOSITORY'),
    IDEMPOTENCY_SERVICE: token('IDEMPOTENCY_SERVICE'),
    LIMIT_REPOSITORY: token('LIMIT_REPOSITORY'),
    LIMIT_SERVICE: token('LIMIT_SERVICE'),
    AGENT_REVISION_REPOSITORY: token('AGENT_REVISION_REPOSITORY'),
    AGENT_REVISION_SERVICE: token('AGENT_REVISION_SERVICE'),
    CONNECTION_REPOSITORY: token('CONNECTION_REPOSITORY'),
    CONNECTION_SERVICE: token('CONNECTION_SERVICE'),
    CONVERSATION_REPOSITORY: token('CONVERSATION_REPOSITORY'),
    CONVERSATION_SERVICE: token('CONVERSATION_SERVICE'),
    DATA_SOURCE: token('DATA_SOURCE'),
    ENGINE: token('ENGINE'),
    MODELS: token('MODELS'),
    PEERS: token('PEERS'),
    SHUTDOWN: token('SHUTDOWN'),
    SERVER: token('SERVER'),
    HTTP_ROUTES: token('HTTP_ROUTES'),
    HTTP_CONTROLLERS: token('HTTP_CONTROLLERS'),
    OPENAPI_DOCUMENTS: token('OPENAPI_DOCUMENTS'),
    AUTHENTICATORS: token('AUTHENTICATORS'),
    CHANNELS: token('CHANNELS'),
    COMPONENTS: token('COMPONENTS'),
    COMPONENT_LIST: token('COMPONENT_LIST'),
    LIFECYCLE_HOOKS: token('LIFECYCLE_HOOKS'),
    AGENT_ISSUES: token('AGENT_ISSUES'),
    AGENT_CHECKS: token('AGENT_CHECKS'),
    GIT_CREDENTIALS: token('GIT_CREDENTIALS'),
    KEYRING: token('KEYRING'),
    CONNECTIONS: token('CONNECTIONS'),
    CONNECTION_TYPES: token('CONNECTION_TYPES'),
    CONNECTION_CONFIGS: token('CONNECTION_CONFIGS'),
    UI_PAGES: token('UI_PAGES'),
    UI_AUTH: token('UI_AUTH'),
} as const;

/**
 * The built-in modules' names; list a module of the same name to replace one.
 * `COMPONENTS` runs the contributed components. `CONSOLE` names the optional `consoleChannelModule()`, `UI` the dashboard's
 * `uiModule()` of `@chamvi/ui/module`.
 */
export const ModuleName = {
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
} as const;

/** The order of the authenticator chain (lowest first). */
export const AUTHENTICATOR_ORDER = {
    STATIC_TOKENS: 0,
    AUTHUP: 10,
    OIDC: 20,
} as const;

export const APP_ERROR_CODE = {
    STOPPED: 'app_stopped',
    IN_USE: 'app_in_use',
    STOP_FAILED: 'app_stop_failed',
    /** A check (`IApp.check()`) found migrations a start would not apply (`MIGRATE=false`). */
    STORE_NOT_MIGRATED: 'store_not_migrated',
    /** A job's agent is a package agent that did not load, check or prepare, or a package failed before its agents were known. */
    PACKAGE_AGENT_FAILED: 'package_agent_failed',
} as const;

/** PostgreSQL's undefined_table and undefined_column. */
export const SCHEMA_BEHIND_SQLSTATES: readonly string[] = ['42P01', '42703'];

/** The authup realm (name or id) the server and dashboard clients live in, unless `AUTHUP_REALM` names another. */
export const AUTHUP_REALM_DEFAULT = 'master';

/** The public authup client the dashboard signs in with, unless `UI_AUTHUP_CLIENT_ID` names another. */
export const UI_AUTHUP_CLIENT_ID_DEFAULT = 'chamvi';
