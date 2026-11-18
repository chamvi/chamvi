/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { TimeoutError } from '@chamvi/core';
import type { IContainer } from 'eldin';
import { defineComponentGroup } from 'hubwire';
import type { IComponentGroup } from 'hubwire';
import type { IModule, ModuleDependency } from 'orkos';
import { AppToken, ModuleName } from '../../module/constants.ts';
import { remainingDrainMs } from '../../module/drain.ts';
import { registerStartStep } from '../../module/start.ts';
import type { AppContext } from '../../module/types.ts';
import { assertComponents } from './helpers.ts';

/** Start mode outside a check: the only lifecycle that runs components. */
function runsComponents(context: AppContext): boolean {
    return context.mode === 'start' && !context.check;
}

/**
 * Runs every `AppToken.COMPONENTS` contribution as one hubwire component
 * group (start mode outside a check only). `onReady` checks the names and
 * registers `COMPONENT_LIST` and a start step, so the group starts after the
 * engine with its channels; a component whose `start()` fails fails the app
 * start (the group stops those it started). The `stopping` hook (before the
 * drain) and `teardown` stop the group once, bounded by
 * `CHAMVI_DRAIN_TIMEOUT_MS` on the app clock, a budget the engine drain after
 * it shares (the drain gets what remains): a component whose `stop()` or
 * `settled()` never resolves is reported, never awaited past it.
 */
export class ComponentsModule implements IModule {
    readonly name: string = ModuleName.COMPONENTS;

    // optional: their onReady (the agents' boot, the engine's start step) comes first
    readonly dependencies: (string | ModuleDependency)[] = [
        ModuleName.CONFIG,
        { name: ModuleName.STORE, optional: true },
        { name: ModuleName.ENGINE, optional: true },
        { name: ModuleName.AGENTS, optional: true },
    ];

    protected group: IComponentGroup | undefined;

    protected stopping: Promise<void> | undefined;

    async setup(container: IContainer): Promise<void> {
        if (!runsComponents(container.resolve(AppToken.CONTEXT))) {
            return;
        }

        container.registerMany(AppToken.LIFECYCLE_HOOKS, {
            useValue: {
                name: ModuleName.COMPONENTS,
                stopping: () => this.stop(container),
            },
        });
    }

    async onReady(container: IContainer): Promise<void> {
        const context = container.resolve(AppToken.CONTEXT);

        if (!runsComponents(context)) {
            return;
        }

        const components = container.resolveAll(AppToken.COMPONENTS);

        assertComponents(components);

        const group = defineComponentGroup({ hooks: { onStopFailed: (name, error) => context.report(error, { component: name }) } });

        for (const { name, component } of components) {
            group.add(name, component);
        }

        this.group = group;
        container.register(AppToken.COMPONENT_LIST, { useValue: Object.freeze([...components]) });
        registerStartStep(container, ModuleName.COMPONENTS, () => group.start());
    }

    async teardown(container: IContainer): Promise<void> {
        await this.stop(container);
    }

    /** Stops the group once; resolves at the shared drain deadline at the latest. */
    protected stop(container: IContainer): Promise<void> {
        const { group } = this;

        if (!group) {
            return Promise.resolve();
        }

        this.stopping ??= this.stopWithin(container, group);

        return this.stopping;
    }

    protected async stopWithin(container: IContainer, group: IComponentGroup): Promise<void> {
        // the drain after it gets only what remains of this budget
        const timeoutMs = remainingDrainMs(container);
        const { promise, resolve } = Promise.withResolvers<boolean>();
        const timer = container.resolve(AppToken.CLOCK).setTimeout(() => resolve(false), timeoutMs);

        // the group stops every component, then awaits each settled(); it never rejects
        group.stop().then(() => resolve(true), () => resolve(true));

        const stopped = await promise;

        timer.clear();

        if (!stopped) {
            container.resolve(AppToken.CONTEXT).report(
                new TimeoutError(timeoutMs, `The components did not stop and settle within ${timeoutMs}ms.`),
                { module: this.name },
            );
        }
    }
}

export function componentsModule(): IModule {
    return new ComponentsModule();
}
