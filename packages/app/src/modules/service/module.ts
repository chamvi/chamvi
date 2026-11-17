/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    AgentRevisionService,
    ArtifactService,
    CheckpointService,
    ConnectionService,
    ConversationService,
    EffectService,
    IdempotencyService,
    InvalidAgentDefinitionError,
    LockService,
    RunService,
    StateService,
    StepService,
} from '@chamvi/core';
import type { IContainer } from 'eldin';
import type { IModule } from 'orkos';
import { AppToken, ModuleName } from '../../module/constants.ts';
import { PURGE_HOOK_NAME } from './constants.ts';
import { createPurgeTimer } from './purge.ts';
import type { IPurgeTimer } from './types.ts';

/** The repository tokens every store module registers (connections and conversations are optional). */
const REQUIRED_REPOSITORIES = [
    'RUN_REPOSITORY',
    'STEP_REPOSITORY',
    'CHECKPOINT_REPOSITORY',
    'EFFECT_REPOSITORY',
    'ARTIFACT_REPOSITORY',
    'STATE_REPOSITORY',
    'STATE_DOCUMENT_REPOSITORY',
    'LOCK_REPOSITORY',
    'IDEMPOTENCY_REPOSITORY',
    'AGENT_REVISION_REPOSITORY',
] as const;

/**
 * Builds each service from the repository the store module registered
 * under its token, on the app clock, and registers it under its own token.
 * The connection and conversation services only when their repository is
 * registered. In start mode (not a check) it also registers the purge
 * timer of the lock and idempotency services, returned for the teardown.
 */
function registerServices(container: IContainer): IPurgeTimer | undefined {
    const missing = REQUIRED_REPOSITORIES.filter((name) => !container.has(AppToken[name]));

    if (missing.length > 0) {
        throw new InvalidAgentDefinitionError(`The store module registered no ${missing.join(', ')}.`);
    }

    const context = container.resolve(AppToken.CONTEXT);
    const config = container.resolve(AppToken.CONFIG);
    const clock = container.resolve(AppToken.CLOCK);
    const logger = container.resolve(AppToken.LOGGER);

    const lockService = new LockService({ repository: container.resolve(AppToken.LOCK_REPOSITORY), clock });
    const idempotencyService = new IdempotencyService({ repository: container.resolve(AppToken.IDEMPOTENCY_REPOSITORY), clock });

    container.register(AppToken.RUN_SERVICE, { useValue: new RunService({ repository: container.resolve(AppToken.RUN_REPOSITORY), clock }) });
    container.register(AppToken.STEP_SERVICE, { useValue: new StepService({ repository: container.resolve(AppToken.STEP_REPOSITORY) }) });

    const checkpointService = new CheckpointService({ repository: container.resolve(AppToken.CHECKPOINT_REPOSITORY) });

    container.register(AppToken.CHECKPOINT_SERVICE, { useValue: checkpointService });
    container.register(AppToken.EFFECT_SERVICE, { useValue: new EffectService({ repository: container.resolve(AppToken.EFFECT_REPOSITORY) }) });
    container.register(AppToken.ARTIFACT_SERVICE, { useValue: new ArtifactService({ repository: container.resolve(AppToken.ARTIFACT_REPOSITORY) }) });
    container.register(AppToken.STATE_SERVICE, {
        useValue: new StateService({
            repository: container.resolve(AppToken.STATE_REPOSITORY),
            documentRepository: container.resolve(AppToken.STATE_DOCUMENT_REPOSITORY),
        }),
    });
    container.register(AppToken.LOCK_SERVICE, { useValue: lockService });
    container.register(AppToken.IDEMPOTENCY_SERVICE, { useValue: idempotencyService });

    const agentRevisionService = new AgentRevisionService({ repository: container.resolve(AppToken.AGENT_REVISION_REPOSITORY) });

    container.register(AppToken.AGENT_REVISION_SERVICE, { useValue: agentRevisionService });

    // optional: a store without a connection repository keeps no connections (features ask `container.has()`)
    if (container.has(AppToken.CONNECTION_REPOSITORY)) {
        const connectionService = new ConnectionService({ repository: container.resolve(AppToken.CONNECTION_REPOSITORY), clock });

        container.register(AppToken.CONNECTION_SERVICE, { useValue: connectionService });
    }

    // optional: a store without a conversation repository keeps no conversations
    if (container.has(AppToken.CONVERSATION_REPOSITORY)) {
        const conversationService = new ConversationService({ repository: container.resolve(AppToken.CONVERSATION_REPOSITORY), clock });

        container.register(AppToken.CONVERSATION_SERVICE, { useValue: conversationService });
    }

    if (context.mode !== 'start' || context.check || config.store.purgeIntervalMs <= 0) {
        return undefined;
    }

    const purge = createPurgeTimer({
        services: [lockService, idempotencyService],
        clock,
        intervalMs: config.store.purgeIntervalMs,
        logger,
    });

    container.registerMany(AppToken.LIFECYCLE_HOOKS, {
        useValue: {
            name: PURGE_HOOK_NAME,
            started: () => purge.start(),
            stopping: () => purge.stop(),
        },
    });

    return purge;
}

/**
 * The store step of an app: the module named `ModuleName.STORE` (the
 * built-in `storeModule()` or a module replacing it) registers the
 * repository tokens, then `@chamvi/app` builds every service from them in
 * the same setup step, so a module depending on the store module resolves
 * the services in its `setup`. Any other module is returned as is.
 */
export function withServices(module: IModule): IModule {
    if (module.name !== ModuleName.STORE) {
        return module;
    }

    const {
        setup,
        teardown,
        onReady,
        onError,
    } = module;
    let purge: IPurgeTimer | undefined;
    // an error of building the services is the wrapper's, not the module's: its onError never sees it
    let failed: unknown;

    const hooks: Record<string, unknown> = {
        name: module.name,
        version: module.version,
        dependencies: module.dependencies,
        async setup(container: IContainer) {
            await setup.call(module, container);

            try {
                purge = registerServices(container);
            } catch (error) {
                failed = error;

                // orkos tears down no module whose setup threw: close what the module opened, keep the first error
                try {
                    await teardown?.call(module, container);
                } catch (teardownError) {
                    container.resolve(AppToken.LOGGER).error('The store module failed to tear down after its services could not be built.', teardownError);
                }

                throw error;
            }
        },
        ...(onReady && { onReady: (container: IContainer) => onReady.call(module, container) }),
        ...(onError && {
            async onError(error: Error, container: IContainer) {
                if (error !== failed) {
                    await onError.call(module, error, container);
                }
            },
        }),
        async teardown(container: IContainer) {
            const running = purge;

            purge = undefined;
            await running?.stop();
            await teardown?.call(module, container);
        },
    };

    // every own property of the module (a symbol key too) but the ones above, which become fresh data properties:
    // a frozen module or a getter name stays as it is
    const descriptors: PropertyDescriptorMap = Object.getOwnPropertyDescriptors(module);

    for (const key of ['name', 'version', 'dependencies', 'setup', 'teardown', 'onReady', 'onError']) {
        delete descriptors[key];
    }

    for (const [key, value] of Object.entries(hooks)) {
        descriptors[key] = {
            value,
            writable: true,
            enumerable: true,
            configurable: true,
        };
    }

    return Object.defineProperties({}, descriptors) as IModule;
}
