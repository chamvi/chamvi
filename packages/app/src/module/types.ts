/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    Agent,
    ConnectionValues,
    IAgentRevisionService,
    IArtifactService,
    IChannel,
    ICheckpointService,
    IClock,
    IConnectionConfigStore,
    IConnectionHandle,
    IConnectionService,
    IConnectionTypeProvider,
    IConversationService,
    IEffectService,
    IEngine,
    IIdempotencyService,
    IKeyring,
    ILockService,
    IModelResolver,
    IRunService,
    IStateService,
    IStepService,
    ModelRef,
    SkillInput,
} from '@chamvi/core';
import type {
    IAgentRevisionRepository,
    IArtifactRepository,
    ICheckpointRepository,
    IConnectionRepository,
    IConversationRepository,
    IEffectRepository,
    IIdempotencyRepository,
    ILockRepository,
    IRunRepository,
    IStateDocumentRepository,
    IStateRepository,
    IStepRepository,
} from '@chamvi/store';
import type {
    AgentIssue,
    Authenticator,
    HttpRoute,
    IShutdown,
    UiPage,
} from '@chamvi/http';
import type { IComponent } from 'hubwire';
import type { DataSource } from 'typeorm';
import type { AppOptions } from '../app/types.ts';
import type { AppConfig } from '../config/types.ts';
import type { Env } from '../env/types.ts';
import type { ILogger } from '../logger/types.ts';
import type { ModelProviders, ProviderConfig } from '../models/types.ts';

export type AppMode = 'start' | 'job' | 'migrate';

export type AppContext = {
    mode: AppMode;
    /** Explicit createApp conversation capability; absent by default. */
    conversations?: AppOptions['conversations'];
    dev: boolean;
    env: Env;
    /** Aborts with the app_stopped ChamviError once stop() is called. */
    signal: AbortSignal;
    /** Logs through the app logger; during stop() also counts as a stop failure. */
    report(error: unknown, context?: Record<string, unknown>): void;
    /** createApp's `models`: AI SDK providers by id, winning over every provider setting for their ids. */
    models?: ModelProviders;
    /** createApp's `model`: the default model of agents without one (CHAMVI_MODEL and the config file win). */
    model?: ModelRef;
    /** createApp's `providers` (env and the config file win per field). */
    providers?: Readonly<Record<string, ProviderConfig>>;
    /** createApp's agents (the agents passed in code); the live set is `engine.listAgents()`. */
    agents: readonly Agent[];
    /** createApp's agent package specifiers; `chamvi.json` `agents` and `CHAMVI_AGENTS` add theirs in the agents module. */
    packages?: readonly string[];
    /** createApp's additive skill defaults; check and migrate never load sources. */
    skills?: readonly SkillInput[];
    /**
     * `IApp.check()` (mode `start`): every module sets up and checks as for a
     * start, but nothing writes the store and no start step runs. Of the
     * lifecycle hooks only the paired `engineCreated` and `drained` run.
     */
    check?: boolean;
    /** `IApp.runJob()` (mode `job`): the agent the job runs. */
    job?: { agent: string };
};

/**
 * Throws InvalidAgentDefinitionError for an agent a module could not serve
 * (the scheduler: a cron subscription hubwire refuses; http: a `run_<agent>` MCP
 * tool it cannot build). The agents dir runs every check on a folder agent
 * before registering it, so a refusal is a load issue, never a failed boot.
 */
export type AgentCheck = (agent: Agent) => void;

/**
 * A git credential source (structurally `@chamvi/sandbox`'s
 * `IGitCredentials`): modules contribute one to `AppToken.GIT_CREDENTIALS`
 * (`githubModule()` its App's), and `sandboxModule()` asks them after its own.
 */
export type GitCredentialSource = {
    get(input: {
        url: string;
        host: string;
        path: string;
        access: 'read' | 'write';
        runId: string;
        signal?: AbortSignal;
    }): Promise<{
        username: string;
        password: string;
        expiresAt?: Date
    } | undefined>;
};

/** The options of `readStoredConnections()`. */
export type ReadStoredConnectionsOptions = {
    /** Read only the row of this name; other rows are skipped before decryption. */
    name?: string;
};

/** A stored connection as `readStoredConnections()` returns it. */
export type StoredConnection = {
    name: string;
    /** The settings and decrypted secrets. */
    values: ConnectionValues;
    /** The config revision read; the connection's `loadedRevision`. */
    revision: number;
    /** The row's creation time; the connection's `loadedCreatedAt`. */
    createdAt: Date;
};

export interface ILifecycleHook {
    readonly name: string;
    /** After verified preparation, before `engine.start()` (start and job); a check skips preparation. */
    engineCreated?(engine: IEngine): void | Promise<void>;
    /** start only: after engine.start() (which starts the channels), before serve(). */
    started?(): void | Promise<void>;
    /** start only: the shutdown's first step, before the closers, the server close and the drain (which stops the channels). */
    stopping?(): void | Promise<void>;
    /** After the engine drained (start, job and a check; also when the drain failed), before the store closes. */
    drained?(): void | Promise<void>;
}

/**
 * A background job a module contributes to `AppToken.COMPONENTS` (a hubwire
 * component): the components module starts it in start mode (never in a
 * check, a job or a migration) and stops it before the engine drains.
 */
export type AppComponent = {
    /** Unique among the app's components; lower-kebab, at most 64 characters (the agent name rule). */
    name: string;
    component: IComponent;
};

export type LifecyclePhase = 'engineCreated' | 'started' | 'stopping' | 'drained';

export type AuthenticatorEntry = {
    name: string;
    order: number;
    authenticator: Authenticator;
};

/**
 * The part of the HTTP server (srvx, from routup's `serve()`) the app uses,
 * typed structurally so srvx's declarations stay out of the package's types.
 */
export type Server = {
    readonly url?: string;
    ready(): Promise<unknown>;
    close(closeActiveConnections?: boolean): Promise<void>;
};

/** The dashboard's sign-in, shared by its `*-ui` pages (one session, so one CSP for the authup refresh). */
export type UiAuth = {
    /** Offer the token-paste sign-in (static bearer tokens). */
    tokens: boolean;
    authup?: {
        /** The authup API URL. */
        url: string;
        clientId: string;
        realmId?: string;
    };
};

/** Where the store module keeps the rows. */
export type StoreKind = 'memory' | 'database';

export type AppTokens = {
    CONTEXT: AppContext;
    CONFIG: AppConfig;
    LOGGER: ILogger;
    CLOCK: IClock;
    /** Where the store's rows live: in this process (`memory`) or in a database (`database`). */
    STORE_KIND: StoreKind;
    /** The run repository the store module registers (memory, database or a replacing module's). */
    RUN_REPOSITORY: IRunRepository;
    /** The rules of runs over `RUN_REPOSITORY`, on the app clock; the engine module passes it to the engine. */
    RUN_SERVICE: IRunService;
    /** The step repository the store module registers (memory, database or a replacing module's). */
    STEP_REPOSITORY: IStepRepository;
    /** The steps of runs over `STEP_REPOSITORY`; the engine module passes it to the engine. */
    STEP_SERVICE: IStepService;
    /** The checkpoint repository the store module registers (memory, database or a replacing module's). */
    CHECKPOINT_REPOSITORY: ICheckpointRepository;
    /** The latest checkpoint of each run over `CHECKPOINT_REPOSITORY`; the engine module passes it to the engine. */
    CHECKPOINT_SERVICE: ICheckpointService;
    /** The effect repository the store module registers (memory, database or a replacing module's). */
    EFFECT_REPOSITORY: IEffectRepository;
    /** Recorded effect results over `EFFECT_REPOSITORY`; the engine module passes it to the engine. */
    EFFECT_SERVICE: IEffectService;
    /** The artifact repository the store module registers (memory, database or a replacing module's). */
    ARTIFACT_REPOSITORY: IArtifactRepository;
    /** The files of runs over `ARTIFACT_REPOSITORY`; the engine module passes it to the engine. */
    ARTIFACT_SERVICE: IArtifactService;
    /** The state key repository the store module registers (memory, database or a replacing module's). */
    STATE_REPOSITORY: IStateRepository;
    /** The state document repository the store module registers (memory, database or a replacing module's). */
    STATE_DOCUMENT_REPOSITORY: IStateDocumentRepository;
    /** Agent state over `STATE_REPOSITORY` and `STATE_DOCUMENT_REPOSITORY`; the engine module passes it to the engine. */
    STATE_SERVICE: IStateService;
    /** The lock repository the store module registers (memory, database or a replacing module's). */
    LOCK_REPOSITORY: ILockRepository;
    /** Leases over `LOCK_REPOSITORY`, on the app clock; the engine module passes it to the engine, connections and features lock through it. */
    LOCK_SERVICE: ILockService;
    /** The idempotency key repository the store module registers (memory, database or a replacing module's). */
    IDEMPOTENCY_REPOSITORY: IIdempotencyRepository;
    /** Dispatch idempotency keys over `IDEMPOTENCY_REPOSITORY`, on the app clock; the engine module passes it to the engine. */
    IDEMPOTENCY_SERVICE: IIdempotencyService;
    /** The agent revision repository the store module registers (memory, database or a replacing module's). */
    AGENT_REVISION_REPOSITORY: IAgentRevisionRepository;
    /** The revision markers of folder agents over `AGENT_REVISION_REPOSITORY`; the engine module passes it to the engine. */
    AGENT_REVISION_SERVICE: IAgentRevisionService;
    /**
     * The connection repository the store module registers (memory,
     * database or a replacing module's); optional (`container.has()`).
     */
    CONNECTION_REPOSITORY: IConnectionRepository;
    /**
     * Connections, their entries and config over `CONNECTION_REPOSITORY`, on
     * the app clock, fenced by the leases of `LOCK_SERVICE`. Registered only
     * while the store keeps connections: a feature asks `container.has()`.
     */
    CONNECTION_SERVICE: IConnectionService;
    /**
     * The conversation repository the store module registers (memory,
     * database or a replacing module's); optional (`container.has()`).
     */
    CONVERSATION_REPOSITORY: IConversationRepository;
    /**
     * Conversations, their transcripts and notes over
     * `CONVERSATION_REPOSITORY`, on the app clock. Registered only while
     * the store keeps conversations: the engine module passes it to the
     * engine, the conversation capability needs it.
     */
    CONVERSATION_SERVICE: IConversationService;
    DATA_SOURCE: DataSource;
    ENGINE: IEngine;
    /** The engine module's model resolver (start and job mode, a check too): chat and, through `embedding()`, embedding models. */
    MODELS: IModelResolver;
    SHUTDOWN: IShutdown;
    SERVER: Server;
    HTTP_ROUTES: HttpRoute;
    /**
     * A collection: instances of `@routup/decorators` controller classes the
     * http app mounts after its own (start mode, a check too). Register a
     * `useFactory` to build one from the container's values when the http
     * module resolves the token, after every module's `setup`.
     */
    HTTP_CONTROLLERS: object;
    /**
     * A collection: OpenAPI documents of the contributed controllers, merged
     * into the served `/openapi.json` after the `openapi.documents` option's;
     * ignored with `httpModule({ openapi: false })`.
     */
    OPENAPI_DOCUMENTS: object;
    AUTHENTICATORS: AuthenticatorEntry;
    /** A collection: the channels modules contribute (`registerMany` in `setup`). */
    CHANNELS: IChannel<any, any>;
    LIFECYCLE_HOOKS: ILifecycleHook;
    /**
     * A collection: the background jobs modules contribute (`registerMany` in
     * `setup`); the components module runs them in start mode.
     */
    COMPONENTS: AppComponent;
    /**
     * The components the components module runs, in start order (start mode
     * outside a check, from its `onReady` on); each answers its `status()`.
     */
    COMPONENT_LIST: readonly AppComponent[];
    /** The agents dir's and agent packages' load issues (`chamvi:agents`, when a dir or a package is configured), at the time of the call. */
    AGENT_ISSUES: () => readonly AgentIssue[];
    /** A collection: every module's check of a folder agent before it is registered. */
    AGENT_CHECKS: AgentCheck;
    /** A collection: git credential sources modules contribute for the workspaces (`sandboxModule()` reads them). */
    GIT_CREDENTIALS: GitCredentialSource;
    /**
     * The app's keyring from `CHAMVI_ENCRYPTION_KEYS`, built when first
     * resolved: without the variable, or malformed, resolving throws
     * InvalidAgentDefinitionError (naming the variable, never the value), so
     * only an app with a module that needs it needs the variable.
     */
    KEYRING: IKeyring;
    /** A collection: the connection handles modules contribute; the http app serves them at `/connections`. */
    CONNECTIONS: IConnectionHandle;
    /** A collection: the connection types modules contribute. */
    CONNECTION_TYPES: IConnectionTypeProvider;
    /**
     * The settings and sealed secrets of connections, over
     * `CONNECTION_SERVICE`: list `ModuleName.STORE` in `dependencies` to
     * resolve it in `setup`. Built lazily; resolving it throws
     * InvalidAgentDefinitionError while the store keeps no connections; the
     * keyring is resolved only when a secret is touched, so reading plain
     * settings needs no `CHAMVI_ENCRYPTION_KEYS`.
     */
    CONNECTION_CONFIGS: IConnectionConfigStore;
    /** A collection: the separately built pages modules contribute; the shell lists them from `GET /ui-pages`. */
    UI_PAGES: UiPage;
    /**
     * The sign-in the dashboard serves (`uiModule()` registers it in `setup`);
     * a `*-ui` page reads it, else `readUiAuth()` of the env.
     */
    UI_AUTH: UiAuth;
};
