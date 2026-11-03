/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    ChamviError,
    InvalidAgentDefinitionError,
    InvalidRunStateError,
    formatRevision,
} from '@chamvi/core';
import type { IEngine } from '@chamvi/core';
import type { IContainer } from 'eldin';
import type { IModule } from 'orkos';
import { readConfigFileAgents } from '../../models/file.ts';
import { APP_ERROR_CODE, AppToken, ModuleName } from '../../module/constants.ts';
import { isPackageMarker, mergePackageSpecifiers } from '../../package/helpers.ts';
import {
    AGENTS_WATCHER_HOOK_NAME,
    AGENT_RELOADED_MESSAGE,
    AGENT_REMOVED_MESSAGE,
    NO_AGENTS_MESSAGE,
    NO_DIRECTORY_MESSAGE,
    ORPHANS_KEPT_MESSAGE,
    UNRESOLVED_PACKAGE_RESERVED_MESSAGE,
} from './constants.ts';
import { isDirectory, removeOrphanAgents, resolveAgentsRoot } from './helpers.ts';
import type { ILogger } from '../../logger/types.ts';
import type { AgentCheck } from '../../module/types.ts';
import { createPackageAgents } from './packages.ts';
import type {
    AgentsModuleOptions,
    AgentsWatcherRole,
    IAgentsWatcher,
    IPackageAgents,
} from './types.ts';
import { createAgentsWatcher } from './watcher.ts';

/**
 * The agent packages (createApp's specifiers, then `chamvi.json` `agents`,
 * then `CHAMVI_AGENTS`; loaded once in `onReady`, before the folders, code
 * agents winning a name, then the earlier package) and the agents dir
 * (`CHAMVI_AGENTS_DIR`, else `./agents` when that is a directory; start and
 * job mode, nothing in migrate mode). Without a dir or a package an app
 * without agents passed in code starts empty (a warning). With one, `setup` registers `AGENT_ISSUES` and (start mode) the watcher's
 * lifecycle hook; `onReady` loads every folder into the engine before any
 * start step runs (a folder changed while the app was down cancels its old
 * runs once, logged `agent reloaded`/`agent removed` with the ids of the
 * runs whose cancel went through (a run on another replica may still
 * complete); in start mode a marker without a folder, code or package agent
 * removes that agent, also without a dir, unless a package did not load,
 * whose stored package markers also keep folders of their name out), and the
 * watcher polls every `CHAMVI_AGENTS_POLL_MS` from `started` until
 * `stopping` or `teardown`, awaiting a reload in flight. A job never cancels:
 * a revision conflict of the job's own agent fails the job
 * (InvalidRunStateError), another agent's is an issue. A folder agent whose
 * skill preparation fails is an issue (the others start, polling retries);
 * a job of that agent fails with the preparation error. A check
 * (`context.check`) only loads and checks, writing nothing; it also runs
 * every `AGENT_CHECKS` contribution over the agents passed in code, since a check
 * never reaches `engine.start()` (the cron channel's check of them).
 */
export class AgentsModule implements IModule {
    readonly name: string = ModuleName.AGENTS;

    readonly dependencies = [ModuleName.CONFIG, ModuleName.ENGINE];

    protected watcher: IAgentsWatcher | undefined;

    protected packageAgents: IPackageAgents | undefined;

    /** The merged package specifiers this lifecycle loads; set by `setup`. */
    protected packages: string[] = [];

    protected options: AgentsModuleOptions;

    /** Ends the `agents.cancelled` subscription (start and job mode). */
    protected unsubscribe: (() => void) | undefined;

    /** The agents dir this lifecycle loads, absolute; set by `setup`. */
    protected root: string | undefined;

    constructor(options: AgentsModuleOptions = {}) {
        this.options = options;
    }

    protected get cwd(): string {
        return this.options.cwd ?? process.cwd();
    }

    async setup(container: IContainer): Promise<void> {
        const context = container.resolve(AppToken.CONTEXT);

        if (context.mode === 'migrate') {
            return;
        }

        const { dir, packages } = container.resolve(AppToken.CONFIG).agents;

        // the model settings' config file (the process cwd, never options.cwd); an unreadable one already failed the engine module
        this.packages = mergePackageSpecifiers(context.packages, await readConfigFileAgents(context.env, process.cwd()), packages);
        // a dir named explicitly must exist, checked in onReady
        this.root = await resolveAgentsRoot(dir, this.cwd);

        if (this.root === undefined && this.packages.length === 0) {
            if (context.agents.length === 0) {
                container.resolve(AppToken.LOGGER).warn(NO_AGENTS_MESSAGE);
            }

            return;
        }

        container.register(AppToken.AGENT_ISSUES, { useValue: () => [...this.packageAgents?.issues() ?? [], ...this.watcher?.issues() ?? []] });

        if (context.mode === 'start' && !context.check) {
            container.registerMany(AppToken.LIFECYCLE_HOOKS, {
                useValue: {
                    name: AGENTS_WATCHER_HOOK_NAME,
                    started: () => {
                        this.packageAgents?.start();
                        this.watcher?.start();
                    },
                    stopping: () => this.stopAll(),
                },
            });
        }
    }

    async onReady(container: IContainer): Promise<void> {
        const context = container.resolve(AppToken.CONTEXT);
        const config = container.resolve(AppToken.CONFIG);
        const { root } = this;

        if (context.mode === 'migrate') {
            return;
        }

        if (context.check) {
            // a start runs these on the agents passed in code in engine.start() (the cron channel), which a check never calls
            const check = createAgentCheck(container);

            for (const agent of context.agents) {
                check(agent);
            }
        }

        if (root === undefined && this.packages.length === 0) {
            if (context.mode === 'start' && !context.check) {
                // the last package left the list: its stored package agents are removed; folder markers stay without an agents dir
                const engine = container.resolve(AppToken.ENGINE);
                const codeNames = new Set(context.agents.map((agent) => agent.name));

                this.logCancelled(engine, container.resolve(AppToken.LOGGER));
                await removeOrphanAgents(engine, (name, marker) => codeNames.has(name) || !isPackageMarker(marker));
            }

            return;
        }

        if (root !== undefined && !await isDirectory(root)) {
            throw new InvalidAgentDefinitionError(NO_DIRECTORY_MESSAGE);
        }

        const engine = container.resolve(AppToken.ENGINE);
        const logger = container.resolve(AppToken.LOGGER);

        if (!context.check) {
            // before the boot: a folder or package changed while the app was down is logged too
            this.logCancelled(engine, logger);
        }

        let role: AgentsWatcherRole = 'start';

        if (context.check) {
            role = 'check';
        } else if (context.mode === 'job') {
            role = 'job';
        }

        const codeNames = new Set(context.agents.map((agent) => agent.name));
        const common = {
            engine,
            check: createAgentCheck(container),
            clock: container.resolve(AppToken.CLOCK),
            logger,
            pollMs: config.agents.pollMs,
            signal: context.signal,
            role,
        };

        let packageAgents: IPackageAgents | undefined;

        if (this.packages.length > 0) {
            packageAgents = createPackageAgents({
                ...common,
                specs: this.packages,
                cwd: this.cwd,
                dev: context.dev,
                codeNames,
                ...(this.options.importer !== undefined && { importer: this.options.importer }),
            });
            this.packageAgents = packageAgents;
            // before the folders: their names are reserved against them
            await packageAgents.boot();
        }

        let watcher: IAgentsWatcher | undefined;
        const claimed = packageAgents?.reserved() ?? new Map<string, string>();
        const unresolved = packageAgents?.unresolved() ?? [];

        if (root !== undefined) {
            const reserved = new Map<string, string>();

            for (const name of codeNames) {
                reserved.set(name, `${name}: an agent passed in code has this name; the folder is not loaded.`);
            }

            for (const [name, message] of claimed) {
                reserved.set(name, message);
            }

            if (unresolved.length > 0 && role !== 'check') {
                // a package that did not load may hold a stored package agent: a folder must not take it over (and cancel its runs)
                for (const marker of await engine.store.agentRevisions.find()) {
                    if (isPackageMarker(marker.hash) && !reserved.has(marker.agent)) {
                        reserved.set(marker.agent, `${marker.agent}: ${UNRESOLVED_PACKAGE_RESERVED_MESSAGE}`);
                    }
                }
            }

            watcher = createAgentsWatcher({
                ...common,
                root,
                reserved,
                removeOrphans: unresolved.length === 0,
            });
            this.watcher = watcher;
            await watcher.boot();
        } else if (packageAgents !== undefined && role === 'start') {
            // without an agents dir the watcher's orphan sweep runs here, over package markers only: a package agent gone
            // from its package or the list is removed, a folder agent's marker stays (its dir may be an unmounted volume)
            if (unresolved.length > 0) {
                logger.warn(ORPHANS_KEPT_MESSAGE);
            } else {
                await removeOrphanAgents(engine, (name, marker) => codeNames.has(name) || claimed.has(name) || !isPackageMarker(marker));
            }
        }

        if (context.job) {
            this.assertJobAgent(context.job.agent, engine, packageAgents, watcher);
        }
    }

    /** Throws when the job's own agent did not load: a revision conflict, a failed package agent or folder preparation. */
    protected assertJobAgent(
        agent: string,
        engine: IEngine,
        packageAgents: IPackageAgents | undefined,
        watcher: IAgentsWatcher | undefined,
    ): void {
        const conflict = packageAgents?.conflict(agent) ?? watcher?.conflict(agent);

        if (conflict !== undefined) {
            throw new InvalidRunStateError(conflict);
        }

        const failed = packageAgents?.failure(agent);

        if (failed) {
            throw new ChamviError({
                code: APP_ERROR_CODE.PACKAGE_AGENT_FAILED,
                message: failed.message,
                ...(failed.error !== undefined && { cause: failed.error }),
            });
        }

        // a job of an agent whose skills failed to prepare fails with that error (configuration or transient)
        const failure = watcher?.preparationFailure(agent);

        if (failure) {
            throw failure.error;
        }

        const unresolved = packageAgents?.unresolved() ?? [];

        if (unresolved.length > 0 && engine.getAgent(agent) === undefined) {
            // else runJob's "No agent" (a usage error) would hide that a package may hold it
            throw new ChamviError({
                code: APP_ERROR_CODE.PACKAGE_AGENT_FAILED,
                message: `No agent "${agent}" loaded; the package(s) ${unresolved.join(', ')} did not load and may provide it.`,
            });
        }
    }

    /** Logs every `agents.cancelled` sweep (`agent reloaded` or `agent removed`) until teardown. */
    protected logCancelled(engine: IEngine, logger: ILogger): void {
        this.unsubscribe = engine.on('agents.cancelled', (event) => {
            logger.info(event.reason === 'agent_removed' ? AGENT_REMOVED_MESSAGE : AGENT_RELOADED_MESSAGE, {
                agent: event.name,
                ...(event.revision !== undefined && { revision: formatRevision(event.revision) }),
                cancelled: event.runIds,
            });
        });
    }

    /** Resolves once the watcher's poll and the package retry in flight, if any, settled. */
    async idle(): Promise<void> {
        await this.packageAgents?.idle();
        await this.watcher?.idle();
    }

    async teardown(): Promise<void> {
        // idempotent; the issues stay readable
        this.unsubscribe?.();
        this.unsubscribe = undefined;
        await this.stopAll();
    }

    protected async stopAll(): Promise<void> {
        await Promise.all([this.packageAgents?.stop(), this.watcher?.stop()]);
    }
}

/** Every module's `AGENT_CHECKS` contribution (the model is checked by `putAgent`, which refuses before any store write). */
function createAgentCheck(container: IContainer): AgentCheck {
    const checks = container.resolveAll(AppToken.AGENT_CHECKS);

    return (agent) => {
        for (const check of checks) {
            check(agent);
        }
    };
}

export function agentsModule(options?: AgentsModuleOptions): IModule {
    return new AgentsModule(options);
}
