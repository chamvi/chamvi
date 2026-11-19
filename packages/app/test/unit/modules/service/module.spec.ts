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
import {
    MemoryAgentRevisionRepository,
    MemoryArtifactRepository,
    MemoryCheckpointRepository,
    MemoryConnectionRepository,
    MemoryConversationRepository,
    MemoryEffectRepository,
    MemoryIdempotencyRepository,
    MemoryLockRepository,
    MemoryRegistry,
    MemoryRunRepository,
    MemoryStateDocumentRepository,
    MemoryStateRepository,
    MemoryStepRepository,
} from '@chamvi/store-memory';
import { ControllableClock } from '@chamvi/test-kit';
import type { IContainer } from 'eldin';
import type { IModule } from 'orkos';
import { describe, expect, it } from 'vitest';
import {
    AppToken,
    DEFAULT_PURGE_INTERVAL_MS,
    ModuleName,
    componentsModule,
    configModule,
    runHooks,
    storeModule,
} from '@chamvi/app';
import type { AppMode } from '@chamvi/app';
import { memoryStoreModule } from '@chamvi/app/testing';
import { withServices } from '../../../../src/modules/service/module.ts';
import { createHarness } from '../../../utils/harness.ts';
import { createRecordingLogger } from '../../../utils/logger.ts';

function flush(): Promise<void> {
    return new Promise((resolve) => {
        setImmediate(resolve);
    });
}

/** Memory repositories on one registry, each by its own name, as a third-party store would build its own. */
function thirdPartyRepositories() {
    const registry = new MemoryRegistry();

    return {
        run: new MemoryRunRepository({ registry }),
        step: new MemoryStepRepository({ registry }),
        checkpoint: new MemoryCheckpointRepository({ registry }),
        effect: new MemoryEffectRepository({ registry }),
        artifact: new MemoryArtifactRepository({ registry }),
        state: new MemoryStateRepository({ registry }),
        stateDocument: new MemoryStateDocumentRepository({ registry }),
        lock: new MemoryLockRepository({ registry }),
        idempotency: new MemoryIdempotencyRepository({ registry }),
        agentRevision: new MemoryAgentRevisionRepository({ registry }),
    };
}

type ThirdParty = ReturnType<typeof thirdPartyRepositories>;

/**
 * A module replacing the store module: the same name, registering the
 * repository tokens and nothing else (no connections, no conversations).
 */
function replacingStoreModule(repositories: ThirdParty, skip: (keyof typeof AppToken)[] = []): IModule {
    return {
        name: ModuleName.STORE,
        dependencies: [ModuleName.CONFIG],
        setup(container: IContainer) {
            const register = (name: keyof typeof AppToken, value: unknown) => {
                if (!skip.includes(name)) {
                    container.register(AppToken[name] as never, { useValue: value as never });
                }
            };

            register('RUN_REPOSITORY', repositories.run);
            register('STEP_REPOSITORY', repositories.step);
            register('CHECKPOINT_REPOSITORY', repositories.checkpoint);
            register('EFFECT_REPOSITORY', repositories.effect);
            register('ARTIFACT_REPOSITORY', repositories.artifact);
            register('STATE_REPOSITORY', repositories.state);
            register('STATE_DOCUMENT_REPOSITORY', repositories.stateDocument);
            register('LOCK_REPOSITORY', repositories.lock);
            register('IDEMPOTENCY_REPOSITORY', repositories.idempotency);
            register('AGENT_REVISION_REPOSITORY', repositories.agentRevision);

            return Promise.resolve();
        },
    };
}

/** A third-party store whose lock purge settles on demand (the idempotency purge removes nothing). */
function purgingStore() {
    const calls: Array<{ resolve(value: number): void; reject(error: unknown): void }> = [];
    const repositories = thirdPartyRepositories();

    Object.assign(repositories.lock, {
        removeExpiredBy: () => new Promise<number>((resolve, reject) => {
            calls.push({ resolve, reject });
        }),
    });

    return { module: replacingStoreModule(repositories), calls };
}

async function setup(options: {
    mode?: AppMode;
    env?: Record<string, string>;
    store?: IModule;
} = {}) {
    const clock = new ControllableClock();
    const logger = createRecordingLogger(clock);
    const harness = await createHarness({
        mode: options.mode,
        dev: true,
        env: { ...options.env },
        // the components module starts the purge in its start step and stops it on stopping and teardown
        modules: [configModule({ clock, logger }), options.store ?? storeModule(), componentsModule()],
    });

    return {
        harness,
        clock,
        logger,
    };
}

describe('the services of the store step', () => {
    it('each repository and service resolves on memory', async () => {
        const { harness } = await setup();
        const { container } = harness;

        expect(container.resolve(AppToken.STORE_KIND)).toBe('memory');
        expect(container.resolve(AppToken.RUN_REPOSITORY)).toBeInstanceOf(MemoryRunRepository);
        expect(container.resolve(AppToken.STEP_REPOSITORY)).toBeInstanceOf(MemoryStepRepository);
        expect(container.resolve(AppToken.CHECKPOINT_REPOSITORY)).toBeInstanceOf(MemoryCheckpointRepository);
        expect(container.resolve(AppToken.EFFECT_REPOSITORY)).toBeInstanceOf(MemoryEffectRepository);
        expect(container.resolve(AppToken.ARTIFACT_REPOSITORY)).toBeInstanceOf(MemoryArtifactRepository);
        expect(container.resolve(AppToken.STATE_REPOSITORY)).toBeInstanceOf(MemoryStateRepository);
        expect(container.resolve(AppToken.STATE_DOCUMENT_REPOSITORY)).toBeInstanceOf(MemoryStateDocumentRepository);
        expect(container.resolve(AppToken.LOCK_REPOSITORY)).toBeInstanceOf(MemoryLockRepository);
        expect(container.resolve(AppToken.IDEMPOTENCY_REPOSITORY)).toBeInstanceOf(MemoryIdempotencyRepository);
        expect(container.resolve(AppToken.AGENT_REVISION_REPOSITORY)).toBeInstanceOf(MemoryAgentRevisionRepository);
        expect(container.resolve(AppToken.CONNECTION_REPOSITORY)).toBeInstanceOf(MemoryConnectionRepository);
        expect(container.resolve(AppToken.CONVERSATION_REPOSITORY)).toBeInstanceOf(MemoryConversationRepository);

        expect(container.resolve(AppToken.RUN_SERVICE)).toBeInstanceOf(RunService);
        expect(container.resolve(AppToken.STEP_SERVICE)).toBeInstanceOf(StepService);
        expect(container.resolve(AppToken.CHECKPOINT_SERVICE)).toBeInstanceOf(CheckpointService);
        expect(container.resolve(AppToken.EFFECT_SERVICE)).toBeInstanceOf(EffectService);
        expect(container.resolve(AppToken.ARTIFACT_SERVICE)).toBeInstanceOf(ArtifactService);
        expect(container.resolve(AppToken.STATE_SERVICE)).toBeInstanceOf(StateService);
        expect(container.resolve(AppToken.LOCK_SERVICE)).toBeInstanceOf(LockService);
        expect(container.resolve(AppToken.IDEMPOTENCY_SERVICE)).toBeInstanceOf(IdempotencyService);
        expect(container.resolve(AppToken.AGENT_REVISION_SERVICE)).toBeInstanceOf(AgentRevisionService);
        expect(container.resolve(AppToken.CONNECTION_SERVICE)).toBeInstanceOf(ConnectionService);
        expect(container.resolve(AppToken.CONVERSATION_SERVICE)).toBeInstanceOf(ConversationService);
        await harness.stop();
    });

    it('a module replacing the store module supplies the repositories', async () => {
        const repositories = thirdPartyRepositories();
        const { harness, clock } = await setup({ store: replacingStoreModule(repositories) });
        const { container } = harness;

        // its repositories, as registered
        expect(container.resolve(AppToken.RUN_REPOSITORY)).toBe(repositories.run);
        expect(container.resolve(AppToken.STEP_REPOSITORY)).toBe(repositories.step);
        expect(container.resolve(AppToken.CHECKPOINT_REPOSITORY)).toBe(repositories.checkpoint);
        expect(container.resolve(AppToken.EFFECT_REPOSITORY)).toBe(repositories.effect);
        expect(container.resolve(AppToken.ARTIFACT_REPOSITORY)).toBe(repositories.artifact);
        expect(container.resolve(AppToken.STATE_REPOSITORY)).toBe(repositories.state);
        expect(container.resolve(AppToken.STATE_DOCUMENT_REPOSITORY)).toBe(repositories.stateDocument);
        expect(container.resolve(AppToken.LOCK_REPOSITORY)).toBe(repositories.lock);
        expect(container.resolve(AppToken.IDEMPOTENCY_REPOSITORY)).toBe(repositories.idempotency);
        expect(container.resolve(AppToken.AGENT_REVISION_REPOSITORY)).toBe(repositories.agentRevision);
        // no built-in store ran: no kind, no data source
        expect(container.has(AppToken.STORE_KIND)).toBe(false);
        expect(container.has(AppToken.DATA_SOURCE)).toBe(false);

        // the app built every service from them, on the app clock
        const runs = container.resolve(AppToken.RUN_SERVICE);
        const at = new Date(clock.now());

        expect(runs).toBeInstanceOf(RunService);
        await runs.create({
            id: 'r1',
            agent: 'a',
            status: 'queued',
            trigger: {
                id: 't1',
                agent: 'a',
                trigger: 'test',
                channel: 'test',
                payload: {},
                receivedAt: at,
            },
            usage: { inputTokens: 0, outputTokens: 0 },
            createdAt: at,
            updatedAt: at,
        });
        expect(await repositories.run.findOneById('r1')).toMatchObject({ id: 'r1' });
        clock.advance(500);
        expect((await runs.update('r1', { status: 'running' })).updatedAt).toEqual(new Date(clock.now()));
        await expect(container.resolve(AppToken.LOCK_SERVICE).acquire('k', 'a', 10)).resolves.toBeTypeOf('number');
        expect(await repositories.lock.findOneBy({ key: 'k' })).toMatchObject({ owner: 'a' });

        // optional aggregates it does not register stay absent, with their services
        expect(container.has(AppToken.CONNECTION_REPOSITORY)).toBe(false);
        expect(container.has(AppToken.CONNECTION_SERVICE)).toBe(false);
        expect(container.has(AppToken.CONVERSATION_REPOSITORY)).toBe(false);
        expect(container.has(AppToken.CONVERSATION_SERVICE)).toBe(false);
        expect(() => container.resolve(AppToken.CONNECTION_CONFIGS)).toThrow();
        await harness.stop();
    });

    it.each([
        [['LOCK_REPOSITORY', 'STEP_REPOSITORY'], 'STEP_REPOSITORY, LOCK_REPOSITORY'],
        [['RUN_REPOSITORY'], 'RUN_REPOSITORY'],
        [['CHECKPOINT_REPOSITORY', 'STATE_DOCUMENT_REPOSITORY'], 'CHECKPOINT_REPOSITORY, STATE_DOCUMENT_REPOSITORY'],
        [['IDEMPOTENCY_REPOSITORY'], 'IDEMPOTENCY_REPOSITORY'],
        [['AGENT_REVISION_REPOSITORY'], 'AGENT_REVISION_REPOSITORY'],
    ] as const)('a module replacing the store module without %j fails the setup naming it', async (skip, named) => {
        const repositories = thirdPartyRepositories();
        const error = await setup({ store: replacingStoreModule(repositories, [...skip]) }).catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(InvalidAgentDefinitionError);
        expect((error as Error).message).toBe(`The store module registered no ${named}.`);
    });

    it('a store module whose services cannot be built is torn down before the setup fails, its onError untouched', async () => {
        const calls: string[] = [];
        const store: IModule = {
            ...replacingStoreModule(thirdPartyRepositories(), ['RUN_REPOSITORY']),
            async teardown() {
                calls.push('teardown');
            },
            async onError() {
                calls.push('onError');
            },
        };

        await expect(setup({ store })).rejects.toBeInstanceOf(InvalidAgentDefinitionError);
        expect(calls).toEqual(['teardown']);
    });

    it('a store module whose teardown fails while its services cannot be built keeps the first error and logs the teardown\'s', async () => {
        const clock = new ControllableClock();
        const logger = createRecordingLogger(clock);
        const store: IModule = {
            ...replacingStoreModule(thirdPartyRepositories(), ['RUN_REPOSITORY']),
            async teardown() {
                throw new Error('teardown broke');
            },
        };
        const error = await createHarness({ dev: true, modules: [configModule({ clock, logger }), store] }).catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(InvalidAgentDefinitionError);
        expect((error as Error).message).toBe('The store module registered no RUN_REPOSITORY.');
        expect(logger.entries.find((entry) => entry.level === 'error')?.error).toMatchObject({ message: 'teardown broke' });
    });

    it('a frozen store module and one with a getter name are wrapped and set up', async () => {
        const frozen = Object.freeze(replacingStoreModule(thirdPartyRepositories()));
        const getter = replacingStoreModule(thirdPartyRepositories());

        Object.defineProperty(getter, 'name', {
            get: () => ModuleName.STORE,
            enumerable: true,
            configurable: true,
        });

        for (const store of [frozen, getter]) {
            const { harness } = await setup({ store });

            expect(harness.container.resolve(AppToken.RUN_SERVICE)).toBeInstanceOf(RunService);
            expect(withServices(store).name).toBe(ModuleName.STORE);
            await harness.stop();
        }
    });

    it('the store step keeps every own property of the store module, symbol-keyed ones too', () => {
        const descriptor = Symbol.for('chamvi.database.descriptor');
        const store = Object.assign(replacingStoreModule(thirdPartyRepositories()), {
            [descriptor]: { name: 'store' },
            extra: 'kept',
        });
        const wrapped = withServices(store) as IModule & Record<PropertyKey, unknown>;

        expect(wrapped).not.toBe(store);
        expect(wrapped[descriptor]).toBe(store[descriptor]);
        expect(wrapped.extra).toBe('kept');
        expect(wrapped.name).toBe(ModuleName.STORE);
    });

    it('memoryStoreModule keeps the rows of its registry across apps, and leaves out the optional aggregates on request', async () => {
        const registry = new MemoryRegistry();
        const first = await setup({ store: memoryStoreModule({ registry }) });

        await first.harness.container.resolve(AppToken.STATE_SERVICE).set('a', 'k', 1);
        await first.harness.stop();

        const second = await setup({
            store: memoryStoreModule({
                registry,
                connections: false,
                conversations: false,
            }),
        });
        const { container } = second.harness;

        expect(await container.resolve(AppToken.STATE_SERVICE).findOne('a', 'k')).toBe(1);
        expect(container.resolve(AppToken.STORE_KIND)).toBe('memory');
        expect(container.has(AppToken.CONNECTION_SERVICE)).toBe(false);
        expect(container.has(AppToken.CONVERSATION_SERVICE)).toBe(false);
        await second.harness.stop();
    });

    it('purge runs every interval and never overlaps', async () => {
        const { module, calls } = purgingStore();
        const {
            harness,
            clock,
            logger,
        } = await setup({ store: module });

        await runHooks(harness.container, 'started');

        clock.advance(DEFAULT_PURGE_INTERVAL_MS - 1);
        expect(calls).toHaveLength(0);
        clock.advance(1);
        expect(calls).toHaveLength(1);

        // pending: no second call however long it takes
        clock.advance(DEFAULT_PURGE_INTERVAL_MS);
        clock.advance(DEFAULT_PURGE_INTERVAL_MS);
        expect(calls).toHaveLength(1);

        calls[0]!.resolve(1);
        await flush();
        expect(logger.entries.find((entry) => entry.level === 'debug')).toMatchObject({ results: [1, 0] });

        clock.advance(DEFAULT_PURGE_INTERVAL_MS);
        expect(calls).toHaveLength(2);
        calls[1]!.resolve(0);
        await runHooks(harness.container, 'stopping');
        await harness.stop();
    });

    it('purge stops on stopping', async () => {
        const { module, calls } = purgingStore();
        const { harness, clock } = await setup({ store: module });

        await runHooks(harness.container, 'started');
        await runHooks(harness.container, 'stopping');

        clock.advance(DEFAULT_PURGE_INTERVAL_MS * 3);
        expect(calls).toHaveLength(0);
        await harness.stop();
    });

    it('stopping prevents the re-arm of a call in flight', async () => {
        const { module, calls } = purgingStore();
        const { harness, clock } = await setup({ store: module });

        await runHooks(harness.container, 'started');
        clock.advance(DEFAULT_PURGE_INTERVAL_MS);
        expect(calls).toHaveLength(1);

        const stopping = Promise.all([
            runHooks(harness.container, 'stopping'),
            runHooks(harness.container, 'stopping'),
        ]);

        calls[0]!.resolve(0);
        await stopping;
        clock.advance(DEFAULT_PURGE_INTERVAL_MS * 3);
        expect(calls).toHaveLength(1);
        await harness.stop();
    });

    it('stopping waits for a call in flight', async () => {
        const { module, calls } = purgingStore();
        const { harness, clock } = await setup({ store: module });

        await runHooks(harness.container, 'started');
        clock.advance(DEFAULT_PURGE_INTERVAL_MS);
        expect(calls).toHaveLength(1);

        let stopped = false;
        const stopping = runHooks(harness.container, 'stopping').then(() => {
            stopped = true;
        });

        await flush();
        expect(stopped).toBe(false);

        calls[0]!.resolve(0);
        await stopping;
        expect(stopped).toBe(true);
        await harness.stop();
    });

    it('purge failure is logged and re-armed', async () => {
        const { module, calls } = purgingStore();
        const {
            harness,
            clock,
            logger,
        } = await setup({ store: module });

        await runHooks(harness.container, 'started');
        clock.advance(DEFAULT_PURGE_INTERVAL_MS);

        calls[0]!.reject(new Error('connection lost'));
        await flush();

        const errors = logger.entries.filter((entry) => entry.level === 'error');

        expect(errors).toHaveLength(1);
        expect(errors[0]!.error).toMatchObject({ message: 'connection lost' });

        clock.advance(DEFAULT_PURGE_INTERVAL_MS);
        expect(calls).toHaveLength(2);
        calls[1]!.resolve(0);
        await runHooks(harness.container, 'stopping');
        await harness.stop();
    });

    it('teardown stops the purge timer', async () => {
        const { module, calls } = purgingStore();
        const { harness, clock } = await setup({ store: module });

        await runHooks(harness.container, 'started');
        await harness.stop();

        clock.advance(DEFAULT_PURGE_INTERVAL_MS * 3);
        expect(calls).toHaveLength(0);
    });

    it.each(['job', 'migrate'] as const)('no purge component in %s mode', async (mode) => {
        const { module } = purgingStore();
        const { harness } = await setup({
            mode,
            store: module,
            // the config of migrate mode asks for a URL; the replacing store never reads it
            env: mode === 'migrate' ? { DATABASE_URL: 'postgres://u:p@127.0.0.1:1/x' } : {},
        });

        expect(harness.container.resolveAll(AppToken.COMPONENTS)).toEqual([]);
        expect(harness.container.resolveAll(AppToken.LIFECYCLE_HOOKS)).toEqual([]);
        await harness.stop();
    });

    it('no purge component in a check', async () => {
        const clock = new ControllableClock();
        const { module, calls } = purgingStore();
        const harness = await createHarness({
            check: true,
            dev: true,
            modules: [configModule({ clock, logger: createRecordingLogger(clock) }), module, componentsModule()],
        });

        expect(harness.container.resolveAll(AppToken.COMPONENTS)).toEqual([]);
        clock.advance(DEFAULT_PURGE_INTERVAL_MS * 3);
        expect(calls).toHaveLength(0);
        await harness.stop();
    });

    it('no purge component when CHAMVI_PURGE_INTERVAL_MS=0', async () => {
        const { module, calls } = purgingStore();
        const { harness, clock } = await setup({ store: module, env: { CHAMVI_PURGE_INTERVAL_MS: '0' } });

        expect(harness.container.resolveAll(AppToken.COMPONENTS)).toEqual([]);
        clock.advance(DEFAULT_PURGE_INTERVAL_MS * 3);
        expect(calls).toHaveLength(0);
        await harness.stop();
    });

    it('contributes the purge of the built-in memory store as the component store-purge', async () => {
        const { harness } = await setup();

        expect(harness.container.resolveAll(AppToken.COMPONENTS).map((entry) => entry.name)).toEqual(['store-purge']);
        expect(harness.container.resolve(AppToken.COMPONENT_LIST).map((entry) => entry.name)).toEqual(['store-purge']);
        await harness.stop();
    });

    it('contributes the purge of a replacing store as the component store-purge', async () => {
        const { module } = purgingStore();
        const { harness } = await setup({ store: module });

        expect(harness.container.resolveAll(AppToken.COMPONENTS).map((entry) => entry.name)).toEqual(['store-purge']);
        await harness.stop();
    });

    it('records a pass whose purge failed as failed and a successful one as a success', async () => {
        const { module, calls } = purgingStore();
        const { harness, clock } = await setup({ store: module });
        const [purge] = harness.container.resolveAll(AppToken.COMPONENTS);

        clock.advance(DEFAULT_PURGE_INTERVAL_MS);
        calls[0]!.reject(new Error('connection lost'));
        await flush();
        expect(purge!.component.status().lastErrorAt).toBe(clock.now());
        expect(purge!.component.status().lastSuccessAt).toBeUndefined();

        clock.advance(DEFAULT_PURGE_INTERVAL_MS);
        calls[1]!.resolve(0);
        await flush();
        expect(purge!.component.status().lastSuccessAt).toBe(clock.now());
        await harness.stop();
    });
});
