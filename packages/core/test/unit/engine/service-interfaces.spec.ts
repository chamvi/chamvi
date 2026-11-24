/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { jsonSchema } from 'ai';
import {
    describe,
    expect,
    expectTypeOf,
    it,
} from 'vitest';
import {
    RepositoryNotFoundError,
    defineEffectTool,
    defineModelAgent,
} from '@chamvi/core';
import type { Checkpoint, Step } from '@chamvi/store';
import type { 
    AgentRevisionService, 
    ArtifactService, 
    CheckpointService, 
    ConnectionService, 
    ConversationService, 
    EffectResult, 
    EffectService, 
    IAgentRevisionService, 
    IArtifactService, 
    ICheckpointService, 
    IConnectionService, 
    IConversationService, 
    IEffectService, 
    IIdempotencyService, 
    ILockService, 
    IRunService, 
    IStateService, 
    IStepService, 
    IdempotencyClaim, 
    IdempotencyService, 
    LockService, 
    RunService, 
    StateService, 
    StepService, 
} from '@chamvi/core';
import { createTestEngine, createTestServices } from '../../utils/engine.ts';
import { mockModel } from '../../utils/mock-model.ts';

/** Steps in a plain array: no repository, no transaction. */
function plainStepService(steps: Step[]): IStepService {
    const find = async (runId: string) => steps.filter((step) => step.runId === runId);

    return {
        create: async (step) => {
            steps.push(step);
        },
        find,
        findOrFail: async (runId) => {
            const found = await find(runId);

            if (found.length === 0) {
                throw new RepositoryNotFoundError('step');
            }

            return found;
        },
    };
}

/** Checkpoints in a plain map. */
function plainCheckpointService(checkpoints: Map<string, Checkpoint>): ICheckpointService {
    return {
        save: async (checkpoint) => {
            const current = checkpoints.get(checkpoint.runId);

            if (current && current.stepIndex > checkpoint.stepIndex) {
                return current;
            }

            checkpoints.set(checkpoint.runId, checkpoint);

            return checkpoint;
        },
        findOne: async (runId) => checkpoints.get(runId),
        findOneOrFail: async (runId) => {
            const checkpoint = checkpoints.get(runId);

            if (!checkpoint) {
                throw new RepositoryNotFoundError('checkpoint');
            }

            return checkpoint;
        },
    };
}

/** Effect results in a plain map. */
function plainEffectService(results: Map<string, EffectResult>): IEffectService {
    return {
        findOne: async (key) => results.get(key),
        findOneOrFail: async (key) => {
            const result = results.get(key);

            if (!result) {
                throw new RepositoryNotFoundError('effect');
            }

            return result;
        },
        save: async (key, result) => {
            const stored: EffectResult = { result: result ?? null };

            results.set(key, stored);

            return stored;
        },
    };
}

/** Idempotency claims in a plain map, without expiry. */
function plainIdempotencyService(claims: Map<string, string>): IIdempotencyService {
    return {
        claim: async (scope, key, runId): Promise<IdempotencyClaim> => {
            const id = `${scope}\n${key}`;
            const current = claims.get(id);

            if (current !== undefined) {
                return { created: false, runId: current };
            }

            claims.set(id, runId);

            return { created: true, runId };
        },
        findOne: async (scope, key): Promise<IdempotencyClaim | undefined> => {
            const current = claims.get(`${scope}\n${key}`);

            return current !== undefined ? { created: false, runId: current } : undefined;
        },
        release: async (scope, key, runId) => {
            const id = `${scope}\n${key}`;

            if (claims.get(id) === runId) {
                claims.delete(id);
            }
        },
        purgeExpired: async () => 0,
    };
}

describe('service interfaces', () => {
    it('types every service class as an implementation of its interface', () => {
        expectTypeOf<RunService>().toExtend<IRunService>();
        expectTypeOf<StepService>().toExtend<IStepService>();
        expectTypeOf<CheckpointService>().toExtend<ICheckpointService>();
        expectTypeOf<EffectService>().toExtend<IEffectService>();
        expectTypeOf<ArtifactService>().toExtend<IArtifactService>();
        expectTypeOf<StateService>().toExtend<IStateService>();
        expectTypeOf<AgentRevisionService>().toExtend<IAgentRevisionService>();
        expectTypeOf<LockService>().toExtend<ILockService>();
        expectTypeOf<IdempotencyService>().toExtend<IIdempotencyService>();
        expectTypeOf<ConnectionService>().toExtend<IConnectionService>();
        expectTypeOf<ConversationService>().toExtend<IConversationService>();
    });

    it('runs an agent on services that are not built on a repository', async () => {
        const steps: Step[] = [];
        const checkpoints = new Map<string, Checkpoint>();
        const results = new Map<string, EffectResult>();
        const claims = new Map<string, string>();
        let sent = 0;

        const engine = createTestEngine({
            services: {
                ...createTestServices(),
                stepService: plainStepService(steps),
                checkpointService: plainCheckpointService(checkpoints),
                effectService: plainEffectService(results),
                idempotencyService: plainIdempotencyService(claims),
            },
            agents: [defineModelAgent({
                name: 'helper',
                instructions: 'Help.',
                model: mockModel([
                    {
                        parts: [{
                            type: 'tool-call',
                            toolName: 'send',
                            input: { to: 'a' },
                        }],
                    },
                    { parts: [{ type: 'text', text: 'done' }] },
                ]),
                tools: {
                    send: defineEffectTool({
                        inputSchema: jsonSchema<{ to: string }>({
                            type: 'object',
                            properties: { to: { type: 'string' } },
                            required: ['to'],
                        }),
                        execute: async () => {
                            sent += 1;

                            return { sent: true };
                        },
                    }),
                },
            })],
        });

        await engine.start();

        try {
            const first = await engine.dispatch({
                agent: 'helper',
                trigger: 'test',
                channel: 'test',
                payload: 'hello',
                idempotencyKey: 'once',
            });
            const second = await engine.dispatch({
                agent: 'helper',
                trigger: 'test',
                channel: 'test',
                payload: 'hello',
                idempotencyKey: 'once',
            });

            await engine.idle();

            const run = await engine.runService.findOneOrFail(first.runId);

            expect(run.status).toBe('completed');
            expect(run.output).toBe('done');
            expect(second).toMatchObject({ runId: first.runId, deduplicated: true });
            expect(sent).toBe(1);

            // the engine wrote through the plain services, and reads them back
            expect(steps.length).toBeGreaterThan(0);
            expect(steps.every((step) => step.runId === first.runId)).toBe(true);
            expect(await engine.stepService.find(first.runId)).toEqual(steps);
            expect(checkpoints.has(first.runId)).toBe(true);
            expect(Array.from(results.values())).toEqual([{ result: { sent: true } }]);
            expect(Array.from(claims.values())).toEqual([first.runId]);
        } finally {
            await engine.drain({ timeoutMs: 0 });
        }
    });
});
