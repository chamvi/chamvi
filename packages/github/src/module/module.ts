/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    AppToken,
    ModuleName,
    approvalUrlOf,
    readStoredConnections,
} from '@chamvi/app';
import type {
    Env,
    IContainer,
    IModule,
    StoredConnection,
} from '@chamvi/app';
import { InvalidAgentDefinitionError, assertConnectionName } from '@chamvi/core';
import type { Agent, IEngine } from '@chamvi/core';
import { createDeferredGithubApp } from '../app/deferred.ts';
import { createGithubApp } from '../app/module.ts';
import type { GithubAppOptions, IDeferredGithubApp, IGithubApp } from '../app/types.ts';
import { githubChannel } from '../channel/module.ts';
import { provideGithubAppResolver } from '../context/module.ts';
import type { IGithubAppResolver } from '../context/types.ts';
import { githubAppCredentials } from '../credentials/module.ts';
import type { IGithubGitCredentials } from '../credentials/types.ts';
import { GITHUB_CONNECTION_TYPE, GITHUB_MODULE_NAME } from './constants.ts';
import { isComplete, readGithubOptions } from './helpers.ts';
import {
    declaredConnection,
    githubConnectionDefinition,
    loadGithubConnection,
    pinnedConnection,
} from './type.ts';
import type {
    GithubInstance,
    GithubInstances,
    GithubModuleChannelOptions,
    GithubModuleOptions,
} from './types.ts';

/** One collection of the GitHub modules per app, shared by their `setup`s and hooks. */
const INSTANCES = new WeakMap<IContainer, GithubInstances>();

function instancesOf(container: IContainer): GithubInstances {
    let instances = INSTANCES.get(container);

    if (!instances) {
        instances = { list: [], provided: new WeakSet<IEngine>() };
        INSTANCES.set(container, instances);
    }

    return instances;
}

/** A second fallback or a second module targeting one agent would make the App of a run ambiguous. */
function assertUnambiguous(list: readonly GithubInstance[], instance: GithubInstance): void {
    for (const other of list) {
        if (instance.agents === undefined && other.agents === undefined) {
            throw new InvalidAgentDefinitionError(`The GitHub modules "${other.name}" and "${instance.name}" both omit agents; at most one module may be the fallback.`);
        }

        const shared = instance.agents?.find((agent) => other.agents?.includes(agent));

        if (shared !== undefined) {
            throw new InvalidAgentDefinitionError(`The GitHub modules "${other.name}" and "${instance.name}" both target the agent "${shared}".`);
        }
    }
}

/**
 * Refuses an agent on this instance's channel that the instance does not
 * serve, as its tools would act as another App: outside a targeted module's
 * `agents`, or on the fallback's channel while another module targets it.
 */
function assertSubscriber(list: readonly GithubInstance[], instance: GithubInstance, agent: Agent): void {
    const subscribed = (agent.definition.channels ?? []).some((subscription) => subscription.channel === instance.channelName);

    if (!subscribed) {
        return;
    }

    if (instance.agents === undefined) {
        const target = list.find((other) => other.agents?.includes(agent.name));

        if (target) {
            throw new InvalidAgentDefinitionError(`Agent "${agent.name}" subscribes to the channel "${instance.channelName}" of the GitHub module "${instance.name}", but the module "${target.name}" targets it.`);
        }
    } else if (!instance.agents.includes(agent.name)) {
        throw new InvalidAgentDefinitionError(`Agent "${agent.name}" subscribes to the channel "${instance.channelName}" of the GitHub module "${instance.name}", whose agents exclude it.`);
    }
}

function createResolver(list: readonly GithubInstance[]): IGithubAppResolver {
    const targeted = new Map(list.flatMap((instance) => (instance.agents ?? []).map((agent) => [agent, instance.app] as const)));
    const fallback = list.find((instance) => instance.agents === undefined)?.app;
    const unserved = new Map<string, IGithubApp>();

    return {
        appFor(agent) {
            const app = targeted.get(agent) ?? fallback;

            if (app) {
                return app;
            }

            // no connection serves the agent: its errors name the agent, not a connection that may not exist
            let facade = unserved.get(agent);

            if (!facade) {
                facade = createDeferredGithubApp({ agent });
                unserved.set(agent, facade);
            }

            return facade;
        },
    };
}

/**
 * A GitHub App, configured from `options`, env or the connection store.
 * `.app` is a value from the start: the built App with `app` or a complete
 * environment, else a facade whose uses throw ConnectionNotConfiguredError
 * until `setup` read the store. `setup` resolves the connection, contributes
 * the channel (`githubChannel()`, deliveries in at `/channels/<channel name>`,
 * comments out; idle with deliveries answering 503 while not configured), the
 * git credentials (the fallback module's unless `credentials: false`, a
 * targeted module's only with `credentials` set) and, for several modules
 * sharing one provider, the connection type; the first `engineCreated`
 * provides the per-agent resolver (`injectGithubContext(ctx)`). Migrate mode
 * does nothing.
 */
export class GithubModule implements IModule {
    readonly name: string;

    readonly dependencies = [ModuleName.CONFIG, ModuleName.STORE];

    readonly app: IGithubApp;

    /** The instance name: connection name, env prefix and default channel name. */
    protected connection: string;

    protected agents: readonly string[] | undefined;

    protected env: Env;

    /** Undefined when `options.app` is given. */
    protected deferred: IDeferredGithubApp | undefined;

    protected appOptions: Partial<GithubAppOptions>;

    protected channelOptions: GithubModuleChannelOptions;

    /** The App's git credentials, checked when the factory is called; contributed once configured. */
    protected credentials: IGithubGitCredentials | undefined;

    constructor(options: GithubModuleOptions = {}) {
        const {
            name,
            agents,
            app,
            env,
            channel,
            credentials,
            ...appOptions
        } = options;

        if (name !== undefined) {
            try {
                assertConnectionName(name);
            } catch (error) {
                throw new InvalidAgentDefinitionError(`githubModule() name: ${(error as Error).message}`);
            }
        }

        const hasNonName = Array.isArray(agents) && agents.some((agent) => typeof agent !== 'string');

        if (agents !== undefined && (!Array.isArray(agents) || hasNonName)) {
            throw new InvalidAgentDefinitionError('githubModule() agents must be a list of agent names.');
        }

        this.connection = name ?? GITHUB_CONNECTION_TYPE;
        this.name = `${GITHUB_MODULE_NAME}:${this.connection}`;
        this.agents = agents;
        this.env = env ?? process.env;
        this.appOptions = appOptions;
        this.channelOptions = channel ?? {};

        if (app) {
            this.app = app;
        } else {
            const deferred = createDeferredGithubApp({
                connection: this.connection,
                ...(appOptions.proposals !== undefined && { proposals: appOptions.proposals }),
            });
            const merged = readGithubOptions(this.env, this.connection, appOptions);

            if (isComplete(merged)) {
                deferred.bind(createGithubApp(merged));
            }

            this.deferred = deferred;
            this.app = deferred;
        }

        // the fallback contributes by default, a targeted module only when asked to
        const contributes = credentials !== false && (agents === undefined || credentials !== undefined);

        this.credentials = contributes ? githubAppCredentials(this.app, credentials) : undefined;
    }

    async setup(container: IContainer): Promise<void> {
        const context = container.resolve(AppToken.CONTEXT);

        if (context.mode === 'migrate') {
            return;
        }

        const logger = container.resolve(AppToken.LOGGER);
        const instances = instancesOf(container);
        const channelName = this.channelOptions.name ?? this.connection;
        const instance: GithubInstance = {
            name: this.connection,
            app: this.app,
            channelName,
            ...(this.agents !== undefined && { agents: this.agents }),
        };

        assertUnambiguous(instances.list, instance);
        instances.list.push(instance);

        if (instances.list.length === 1) {
            // one provider for every instance, whichever is set up first
            container.registerMany(AppToken.CONNECTION_TYPES, {
                useValue: {
                    definition: githubConnectionDefinition(this.appOptions),
                    creatable: () => false,
                    connections: () => instances.list.flatMap((entry) => (entry.connection ? [entry.connection] : [])),
                },
            });
        }

        // every instance again: a fallback set up first only learns now what this module targets
        for (const agent of context.agents) {
            for (const entry of instances.list) {
                assertSubscriber(instances.list, entry, agent);
            }
        }

        // a folder agent loaded later: refused as a load issue
        container.registerMany(AppToken.AGENT_CHECKS, { useValue: (agent) => assertSubscriber(instances.list, instance, agent) });

        const definition = githubConnectionDefinition();
        const editable = !this.isPinned() && container.resolve(AppToken.STORE).connections !== undefined;
        const row = this.isPinned() ? undefined : await this.readRow(container);
        let resolved;

        if (this.deferred) {
            const loaded = loadGithubConnection({
                name: this.connection,
                definition,
                env: this.env,
                logger,
                row,
                options: this.appOptions,
            });

            resolved = loaded.resolved;

            if (loaded.app) {
                this.deferred.bind(loaded.app);
            }
        } else {
            resolved = pinnedConnection(this.connection, definition, this.app);
        }

        instance.connection = {
            ...declaredConnection(this.connection, resolved, editable, row),
            // the shared provider's type closes over the first module's fetch and clock: this one tests with its own
            test: githubConnectionDefinition(this.appOptions).test,
        };

        const config = container.resolve(AppToken.CONFIG);
        const approvalUrl = this.channelOptions.approvalUrl ?? approvalUrlOf(config);
        const channel = githubChannel({
            ...this.channelOptions,
            name: channelName,
            locks: this.channelOptions.locks ?? {
                acquire: (...args) => container.resolve(AppToken.STORE).locks.acquire(...args),
                renew: (...args) => container.resolve(AppToken.STORE).locks.renew(...args),
                release: (...args) => container.resolve(AppToken.STORE).locks.release(...args),
            },
            app: this.app,
            ...(approvalUrl && { approvalUrl }),
            clock: container.resolve(AppToken.CLOCK),
            // a failed agent of a delivery (filter, key, dispatch) belongs in the app's log
            onError: this.channelOptions.onError ?? ((error) => logger.error('github channel error', error)),
        });

        container.registerMany(AppToken.CHANNELS, { useValue: channel });

        // an idle module's credentials would answer with a not-configured failure instead of nothing
        if (this.credentials && (!this.deferred || this.deferred.configured)) {
            container.registerMany(AppToken.GIT_CREDENTIALS, { useValue: this.credentials });
        }

        container.registerMany(AppToken.LIFECYCLE_HOOKS, {
            useValue: {
                name: this.name,
                engineCreated: (engine) => {
                    this.warnUnknownAgents(container, engine);

                    if (instances.provided.has(engine)) {
                        return;
                    }

                    instances.provided.add(engine);
                    provideGithubAppResolver(engine, createResolver(instances.list));
                },
            },
        });
    }

    protected isPinned(): boolean {
        return this.deferred === undefined;
    }

    protected async readRow(container: IContainer): Promise<StoredConnection | undefined> {
        const [row] = await readStoredConnections(container, GITHUB_CONNECTION_TYPE, { name: this.connection });

        return row;
    }

    protected warnUnknownAgents(container: IContainer, engine: IEngine): void {
        const names = new Set(engine.listAgents().map((agent) => agent.name));

        for (const agent of this.agents ?? []) {
            if (!names.has(agent)) {
                container.resolve(AppToken.LOGGER).warn(`The GitHub module "${this.connection}" targets the agent "${agent}", which is not registered.`);
            }
        }
    }
}

/**
 * A GitHub App module: `name` (default `github`) names its connection,
 * default channel and env prefix (`GITHUB_*` for the default,
 * `CHAMVI_GITHUB_<NAME>_*` otherwise), `agents` the agents it serves (none: the
 * fallback). See `GithubModule`.
 */
export function githubModule(options?: GithubModuleOptions): GithubModule {
    return new GithubModule(options);
}
