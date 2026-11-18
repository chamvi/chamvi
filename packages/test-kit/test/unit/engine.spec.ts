/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import {
    DEFAULT_CONVERSATION_LIMITS,
    InvalidAgentDefinitionError,
    LeaseLostError,
    RunNotFoundError,
    defineSimpleAgent,
} from '@chamvi/core';
import { ControllableClock, createTestEngine, testUuid } from '@chamvi/test-kit';

describe('createTestEngine', () => {
    it('runs on memory repositories and the given clock', async () => {
        const clock = new ControllableClock(new Date(5_000));
        const engine = createTestEngine({
            clock,
            agents: [defineSimpleAgent({ name: 'echo', run: async (payload) => payload })],
        });

        await engine.start({ channels: false });

        const { runId } = await engine.dispatch({
            agent: 'echo',
            trigger: 'test',
            channel: 'test',
            payload: 'hello',
        });

        await engine.idle();
        await engine.stop();

        const run = await engine.runService.findOneOrFail(runId);

        expect(run).toMatchObject({ status: 'completed', output: 'hello' });
        expect(run.createdAt).toEqual(new Date(5_000));
        expect(engine.clock).toBe(clock);
        // the checkpoints of the default storage reference their runs
        await expect(engine.checkpointService.save({
            runId: 'missing',
            stepIndex: 0,
            messages: [],
            createdAt: new Date(clock.now()),
        })).rejects.toMatchObject({ code: 'run_not_found' });
    });

    it('carries a connection service on its storage, fenced by the leases of its lock service on its clock', async () => {
        const clock = new ControllableClock(new Date(5_000));
        const engine = createTestEngine({ agents: [], clock });
        const connections = engine.connectionService!;
        const write = (owner: string) => connections.writeEntries('wa', { set: { k: new Uint8Array([1]) } }, { lock: 'connection:wa', owner });

        await connections.create({
            name: 'wa',
            type: 'whatsapp',
            keyId: 'k1',
            wrappedKey: new Uint8Array([1]),
            createdAt: new Date(clock.now()),
            updatedAt: new Date(clock.now()),
        });

        await expect(write('o1')).rejects.toBeInstanceOf(LeaseLostError);
        expect(await engine.lockService.acquire('connection:wa', 'o1', 1_000)).toBe(true);
        await expect(write('o1')).resolves.toBeUndefined();
        await expect(write('o2')).rejects.toBeInstanceOf(LeaseLostError);
        clock.advance(1_000);
        await expect(write('o1')).rejects.toBeInstanceOf(LeaseLostError);
    });

    it('wraps its conversation service for a fault or a recorder; the service is on the engine\'s registry', async () => {
        const seen: string[] = [];
        const engine = createTestEngine({
            agents: [],
            conversationService: (service) => Object.assign(Object.create(service) as typeof service, {
                resolve: async (identity: Parameters<typeof service.resolve>[0]) => {
                    seen.push(identity.chat);

                    return service.resolve(identity);
                },
            }),
        });

        const scope = await engine.conversationService!.resolve({
            agent: 'a',
            channel: 'chat',
            account: 'main',
            chat: 'room',
            audience: 'direct',
        });

        expect(seen).toEqual(['room']);
        // a turn references a run of the engine's run service
        await expect(engine.conversationService!.beginTurn(scope, testUuid('missing'), 'hi', DEFAULT_CONVERSATION_LIMITS))
            .rejects.toBeInstanceOf(RunNotFoundError);
    });

    it('builds a replica on the services of another engine', async () => {
        const clock = new ControllableClock(new Date(5_000));
        const first = createTestEngine({ agents: [], clock });
        const replica = createTestEngine({
            agents: [],
            replicaOf: first,
            owner: 'b',
        });

        expect(replica.runService).toBe(first.runService);
        expect(replica.stepService).toBe(first.stepService);
        expect(replica.checkpointService).toBe(first.checkpointService);
        expect(replica.effectService).toBe(first.effectService);
        expect(replica.artifactService).toBe(first.artifactService);
        expect(replica.stateService).toBe(first.stateService);
        expect(replica.agentRevisionService).toBe(first.agentRevisionService);
        expect(replica.lockService).toBe(first.lockService);
        expect(replica.idempotencyService).toBe(first.idempotencyService);
        expect(replica.connectionService).toBe(first.connectionService);
        expect(replica.conversationService).toBe(first.conversationService);
        expect(replica.clock).toBe(clock);
        expect(() => createTestEngine({
            agents: [],
            replicaOf: first,
            conversationService: (service) => service,
        })).toThrow('replicaOf');
    });

    it('refuses a replica on another clock than its engine\'s services', () => {
        const first = createTestEngine({ agents: [], clock: new ControllableClock(new Date(5_000)) });

        expect(() => createTestEngine({
            agents: [],
            replicaOf: first,
            clock: new ControllableClock(new Date(5_000)),
        }))
            .toThrow(InvalidAgentDefinitionError);
        expect(createTestEngine({
            agents: [],
            replicaOf: first,
            clock: first.clock,
        }).clock).toBe(first.clock);
    });
});
