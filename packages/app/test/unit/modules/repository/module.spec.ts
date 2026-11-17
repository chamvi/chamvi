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
    DEFAULT_CONVERSATION_LIMITS,
    EffectService,
    IdempotencyService,
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
    MemoryRunRepository,
    MemoryStateDocumentRepository,
    MemoryStateRepository,
    MemoryStepRepository,
} from '@chamvi/store-memory';
import { ControllableClock } from '@chamvi/test-kit';
import type { IModule } from 'orkos';
import { describe, expect, it } from 'vitest';
import {
    AppToken,
    ModuleName,
    configModule,
    storeModule,
} from '@chamvi/app';
import type { AppMode } from '@chamvi/app';
import { memoryStoreModule } from '@chamvi/app/testing';
import { createHarness } from '../../../utils/harness.ts';
import { createRecordingLogger } from '../../../utils/logger.ts';
import { createTestStore, storeModuleOf } from '../../../utils/store.ts';

async function setup(options: {
    mode?: AppMode;
    dev?: boolean;
    env?: Record<string, string>;
    /** A module replacing the store module; default `storeModule()`. */
    store?: IModule;
} = {}) {
    const clock = new ControllableClock();
    const logger = createRecordingLogger(clock);
    const harness = await createHarness({
        mode: options.mode,
        dev: options.dev,
        env: { ...options.env },
        modules: [configModule({ clock, logger }), options.store ?? storeModule()],
    });

    return {
        harness,
        clock,
        logger,
    };
}

describe('storeModule', () => {
    it('is named and depends on the config module', () => {
        const module = storeModule();

        expect(module.name).toBe(ModuleName.STORE);
        expect(module.dependencies).toEqual([ModuleName.CONFIG]);
    });

    it('memory store without DATABASE_URL', async () => {
        const { harness, clock } = await setup();

        expect(harness.container.resolve(AppToken.STORE_KIND)).toBe('memory');
        expect(harness.container.resolve(AppToken.RUN_REPOSITORY)).toBeInstanceOf(MemoryRunRepository);
        expect(harness.container.resolve(AppToken.STEP_REPOSITORY)).toBeInstanceOf(MemoryStepRepository);
        expect(harness.container.resolve(AppToken.RUN_SERVICE)).toBeInstanceOf(RunService);
        expect(harness.container.resolve(AppToken.STEP_SERVICE)).toBeInstanceOf(StepService);
        expect(harness.container.resolve(AppToken.CHECKPOINT_REPOSITORY)).toBeInstanceOf(MemoryCheckpointRepository);
        expect(harness.container.resolve(AppToken.CHECKPOINT_SERVICE)).toBeInstanceOf(CheckpointService);
        expect(harness.container.resolve(AppToken.EFFECT_REPOSITORY)).toBeInstanceOf(MemoryEffectRepository);
        expect(harness.container.resolve(AppToken.EFFECT_SERVICE)).toBeInstanceOf(EffectService);
        expect(harness.container.resolve(AppToken.ARTIFACT_REPOSITORY)).toBeInstanceOf(MemoryArtifactRepository);
        expect(harness.container.resolve(AppToken.ARTIFACT_SERVICE)).toBeInstanceOf(ArtifactService);
        expect(harness.container.resolve(AppToken.STATE_REPOSITORY)).toBeInstanceOf(MemoryStateRepository);
        expect(harness.container.resolve(AppToken.STATE_DOCUMENT_REPOSITORY)).toBeInstanceOf(MemoryStateDocumentRepository);
        expect(harness.container.resolve(AppToken.STATE_SERVICE)).toBeInstanceOf(StateService);

        expect(harness.container.resolve(AppToken.LOCK_REPOSITORY)).toBeInstanceOf(MemoryLockRepository);
        expect(harness.container.resolve(AppToken.LOCK_SERVICE)).toBeInstanceOf(LockService);
        expect(harness.container.resolve(AppToken.IDEMPOTENCY_REPOSITORY)).toBeInstanceOf(MemoryIdempotencyRepository);
        expect(harness.container.resolve(AppToken.IDEMPOTENCY_SERVICE)).toBeInstanceOf(IdempotencyService);
        expect(harness.container.resolve(AppToken.AGENT_REVISION_REPOSITORY)).toBeInstanceOf(MemoryAgentRevisionRepository);
        expect(harness.container.resolve(AppToken.AGENT_REVISION_SERVICE)).toBeInstanceOf(AgentRevisionService);

        expect(harness.container.resolve(AppToken.CONNECTION_REPOSITORY)).toBeInstanceOf(MemoryConnectionRepository);
        expect(harness.container.resolve(AppToken.CONNECTION_SERVICE)).toBeInstanceOf(ConnectionService);
        expect(harness.container.resolve(AppToken.CONVERSATION_REPOSITORY)).toBeInstanceOf(MemoryConversationRepository);
        expect(harness.container.resolve(AppToken.CONVERSATION_SERVICE)).toBeInstanceOf(ConversationService);

        // the lock service runs on the app clock, and the connection service's fence reads its leases on the same registry
        const locks = harness.container.resolve(AppToken.LOCK_SERVICE);
        const connections = harness.container.resolve(AppToken.CONNECTION_SERVICE);
        const fence = { lock: 'connection:wa', owner: 'a' };
        const write = () => connections.writeEntries('wa', { set: { k: new Uint8Array([1]) } }, fence);

        await connections.create({
            name: 'wa',
            type: 'whatsapp',
            keyId: 'k1',
            wrappedKey: new Uint8Array([1]),
            createdAt: clock.now(),
            updatedAt: clock.now(),
        });
        await expect(write()).rejects.toMatchObject({ code: 'lease_lost' });
        await locks.acquire('connection:wa', 'a', 1000);
        await expect(write()).resolves.toBeUndefined();
        clock.advance(1000);
        await expect(write()).rejects.toMatchObject({ code: 'lease_lost' });
        await expect(locks.acquire('connection:wa', 'b', 1000)).resolves.toBe(true);
        await harness.stop();
    });

    it('a memory store checks run references against its run repository, on the app clock', async () => {
        const { harness, clock } = await setup();
        const runs = harness.container.resolve(AppToken.RUN_SERVICE);
        const checkpoints = harness.container.resolve(AppToken.CHECKPOINT_SERVICE);
        const at = clock.now();

        await expect(checkpoints.save({
            runId: 'r1',
            stepIndex: 0,
            messages: [],
            createdAt: at,
        })).rejects.toMatchObject({ code: 'run_not_found' });
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
        await checkpoints.save({
            runId: 'r1',
            stepIndex: 0,
            messages: [],
            createdAt: at,
        });
        clock.advance(500);
        expect((await runs.update('r1', { status: 'running' })).updatedAt).toEqual(clock.now());
        await harness.stop();
    });

    it('a replacing store with a conversation repository gets the conversation service on the app clock', async () => {
        const store = createTestStore();
        const { conversationRepository } = store;
        const { harness, clock } = await setup({ store: storeModuleOf(store) });
        const conversations = harness.container.resolve(AppToken.CONVERSATION_SERVICE);
        const identity = {
            agent: 'a',
            channel: 'chat',
            account: 'main',
            chat: 'room',
            audience: 'direct',
        };

        expect(harness.container.resolve(AppToken.CONVERSATION_REPOSITORY)).toBe(conversationRepository);
        await harness.container.resolve(AppToken.RUN_SERVICE).create({
            id: 'run',
            agent: 'a',
            status: 'running',
            trigger: {
                id: 'run',
                agent: 'a',
                trigger: 'chat',
                channel: 'chat',
                payload: {},
                receivedAt: clock.now(),
            },
            usage: { inputTokens: 0, outputTokens: 0 },
            createdAt: clock.now(),
            updatedAt: clock.now(),
        });

        const begun = await conversations.beginTurn(await conversations.resolve(identity), 'run', 'hello', DEFAULT_CONVERSATION_LIMITS);

        expect(begun).toMatchObject({ kind: 'ready', snapshot: { createdAt: clock.now() } });
        await harness.stop();
    });

    it('a replacing store with a connection repository gets the connection service, fenced by its lock repository', async () => {
        const store = createTestStore();
        const { connectionRepository } = store;
        const { harness, clock } = await setup({ store: storeModuleOf(store) });
        const connections = harness.container.resolve(AppToken.CONNECTION_SERVICE);
        const fence = { lock: 'connection:wa', owner: 'a' };

        expect(harness.container.resolve(AppToken.CONNECTION_REPOSITORY)).toBe(connectionRepository);
        await connections.create({
            name: 'wa',
            type: 'whatsapp',
            keyId: 'k1',
            wrappedKey: new Uint8Array([1]),
            createdAt: clock.now(),
            updatedAt: clock.now(),
        });
        expect(await harness.container.resolve(AppToken.LOCK_SERVICE).acquire(fence.lock, fence.owner, 1000)).toBe(true);
        await expect(connections.writeEntries('wa', { set: { k: new Uint8Array([1]) } }, fence)).resolves.toBeUndefined();
        await harness.stop();
    });

    it('memoryStoreModule builds the connection repository on the registry of the app lock service, or none with connections: false', async () => {
        const clock = new ControllableClock();
        const harness = await createHarness({
            modules: [
                configModule({ clock, logger: createRecordingLogger(clock) }),
                memoryStoreModule(),
            ],
        });
        const locks = harness.container.resolve(AppToken.LOCK_SERVICE);
        const connections = harness.container.resolve(AppToken.CONNECTION_SERVICE);
        const fence = { lock: 'connection:wa', owner: 'a' };
        const write = () => connections.writeEntries('wa', { set: { k: new Uint8Array([1]) } }, fence);

        await connections.create({
            name: 'wa',
            type: 'whatsapp',
            keyId: 'k1',
            wrappedKey: new Uint8Array([1]),
            createdAt: clock.now(),
            updatedAt: clock.now(),
        });
        await expect(write()).rejects.toMatchObject({ code: 'lease_lost' });
        expect(await locks.acquire('connection:wa', 'a', 1000)).toBe(true);
        await expect(write()).resolves.toBeUndefined();
        clock.advance(1000);
        await expect(write()).rejects.toMatchObject({ code: 'lease_lost' });
        await harness.stop();

        const bare = await createHarness({
            modules: [
                configModule({ clock, logger: createRecordingLogger(clock) }),
                memoryStoreModule({ connections: false }),
            ],
        });

        expect(bare.container.has(AppToken.CONNECTION_SERVICE)).toBe(false);
        await bare.stop();

        const without = await createHarness({
            modules: [
                configModule({ clock, logger: createRecordingLogger(clock) }),
                memoryStoreModule({ conversations: false }),
            ],
        });

        expect(without.container.has(AppToken.CONVERSATION_SERVICE)).toBe(false);
        expect(without.container.has(AppToken.CONNECTION_SERVICE)).toBe(true);
        await without.stop();
    });

    it('warns outside dev', async () => {
        const { harness, logger } = await setup();
        const warnings = logger.entries.filter((entry) => entry.msg.includes('DATABASE_URL'));

        expect(warnings).toHaveLength(1);
        expect(warnings[0]!.level).toBe('warn');
        expect(warnings[0]!.msg).toContain('memory store');
        await harness.stop();
    });

    it('silent in dev', async () => {
        const { harness, logger } = await setup({ dev: true });

        expect(logger.entries.filter((entry) => entry.msg.includes('DATABASE_URL'))).toEqual([]);
        await harness.stop();
    });
});
