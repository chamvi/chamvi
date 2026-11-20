/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { defineModelAgent } from '@chamvi/core';
import { RunStatus } from '@chamvi/store';
import type { ApprovalWaitPoint, Run } from '@chamvi/store';
import { approvalDecisionKey } from '../../../src/approval/helpers.ts';
import { deliverApprovalMessage } from '../../../src/engine/approvals/delivery.ts';
import { EngineApprovals } from '../../../src/engine/approvals/module.ts';
import type { ApprovalDeliveryContext, EngineApprovalsContext } from '../../../src/engine/approvals/types.ts';
import { createEngineContext } from '../../../src/engine/context/module.ts';
import type { EngineContextInput } from '../../../src/engine/context/types.ts';
import { ControllableClock } from '../../utils/clock.ts';
import { createTestEngine, createTestServices } from '../../utils/engine.ts';
import { mockModel } from '../../utils/mock-model.ts';
import { fakeSkillRuntime } from '../../utils/skill-runtime.ts';

const START = new Date(Date.UTC(2026, 10, 20, 6));
const TTL = 30_000;

function approvalWait(id: string): ApprovalWaitPoint {
    return {
        kind: 'approval',
        id,
        approvalId: id,
        toolName: 'ask',
        toolCallId: id,
        title: `Approve ${id}?`,
        channel: 'slack',
        address: 'room',
        expiresAt: new Date(START.getTime() + 60_000),
    };
}

function waitingRun(waiting: ApprovalWaitPoint): Run {
    return {
        id: 'run-1',
        agent: 'test',
        status: RunStatus.WAITING,
        trigger: {
            id: 't-1',
            agent: 'test',
            trigger: 'test',
            channel: 'test',
            payload: {},
            receivedAt: START,
        },
        waiting,
        usage: { inputTokens: 0, outputTokens: 0 },
        createdAt: START,
        updatedAt: START,
    } as Run;
}

const flush = () => new Promise<void>((resolve) => {
    setImmediate(resolve);
});

describe('approval delivery record', () => {
    it('does not overwrite a newer wait point with the delivered one', async () => {
        const clock = new ControllableClock(START);
        const store = createTestServices({ clock });
        const errors: unknown[] = [];
        const a = approvalWait('0:a:0');
        const b = approvalWait('1:b:0');
        const run = waitingRun(a);

        await store.runService.create(run);

        // the run moves on to approval B between the record's read and its write
        const update = store.runService.update.bind(store.runService);

        store.runService.update = async (id, patch, expect) => {
            if (patch.waiting?.kind === 'approval' && patch.waiting.notifiedAt) {
                await update(id, { waiting: b }, { expectStatus: [RunStatus.WAITING] });
            }

            return update(id, patch, expect);
        };

        const ctx: ApprovalDeliveryContext = {
            runService: store.runService,
            lockService: store.lockService,
            clock,
            claimTtlMs: TTL,
            deliveryControllers: new Set(),
            emit: () => {},
            onError: (error) => {
                errors.push(error);
            },
            isDraining: () => false,
            getChannel: () => ({ name: 'slack', out: async () => {} }),
        };

        await deliverApprovalMessage(ctx, run, a);

        const stored = await store.runService.findOne(run.id);

        expect(errors).toEqual([]);
        expect(stored?.waiting).toMatchObject({ approvalId: b.approvalId });
        expect(stored?.waiting?.kind === 'approval' ? stored.waiting.notifiedAt : 'other').toBeUndefined();
    });
});

describe('approval resume', () => {
    function setup() {
        const clock = new ControllableClock(START);
        const store = createTestServices({ clock });
        const errors: unknown[] = [];
        const saving = Promise.withResolvers<void>();
        const release = Promise.withResolvers<void>();
        const save = store.effectService.save.bind(store.effectService);

        // the resumer stalls after its transition, while storing the record
        store.effectService.save = async (key, value) => {
            saving.resolve();
            await release.promise;

            return save(key, value);
        };

        const approvals = new EngineApprovals({
            runService: store.runService,
            stepService: store.stepService,
            effectService: store.effectService,
            lockService: store.lockService,
            clock,
            owner: 'stale',
            claimTtlMs: TTL,
            emit: () => {},
            onError: (error: unknown) => {
                errors.push(error);
            },
            isStarted: () => false,
            pump: async () => {},
        } as unknown as EngineApprovalsContext);

        // another replica ran the run, paused it on B, and B was answered
        const takeOver = () => store.runService.update('run-1', {
            status: RunStatus.QUEUED,
            waiting: approvalWait('1:b:0'),
            claim: { owner: 'other', expiresAt: new Date(START.getTime() + 2 * TTL) },
        });

        return {
            store,
            errors,
            saving,
            release,
            approvals,
            takeOver,
            stale: () => new Error('stale'),
        };
    }

    it('does not clear the wait point and claim of a newer resume', async () => {
        const t = setup();
        const a = approvalWait('0:a:0');
        const run = waitingRun(a);

        await t.store.runService.create(run);

        const answered = t.approvals.answer(run, a, { approved: true }, t.stale).catch((error: unknown) => error);

        await t.saving.promise;
        await t.takeOver();
        t.release.resolve();
        await answered;

        const stored = await t.store.runService.findOne(run.id);

        expect(stored?.status).toBe(RunStatus.QUEUED);
        expect(stored?.claim?.owner).toBe('other');
        expect(stored?.waiting).toMatchObject({ approvalId: '1:b:0' });
        expect(t.errors).toEqual([]);
    });

    it('does not undo a newer resume back to waiting', async () => {
        const t = setup();
        const a = approvalWait('0:a:0');
        const run = waitingRun(a);

        await t.store.runService.create(run);

        t.store.stepService.create = async () => {
            throw new Error('step write failed');
        };

        const answered = t.approvals.answer(run, a, { approved: true }, t.stale).catch((error: unknown) => error);

        await t.saving.promise;
        await t.takeOver();
        t.release.resolve();

        expect(await answered).toMatchObject({ message: 'step write failed' });

        const stored = await t.store.runService.findOne(run.id);

        expect(stored?.status).toBe(RunStatus.QUEUED);
        expect(stored?.claim?.owner).toBe('other');
        expect(stored?.waiting).toMatchObject({ approvalId: '1:b:0' });
        expect(t.errors).toEqual([]);
    });

    it('does not overwrite the answer a replica recorded after taking the run over', async () => {
        const t = setup();
        const a = approvalWait('0:a:0');
        const run = waitingRun(a);

        await t.store.runService.create(run);

        // no stall in the save here: the resumer stalls between its transition and the claim renewal
        t.release.resolve();

        const renewing = Promise.withResolvers<void>();
        const resume = Promise.withResolvers<void>();
        const update = t.store.runService.update.bind(t.store.runService);
        let updates = 0;

        t.store.runService.update = async (...args: Parameters<typeof update>) => {
            updates++;

            if (updates === 2) {
                renewing.resolve();
                await resume.promise;
            }

            return update(...args);
        };

        const answered = t.approvals.answer(run, a, { approved: true }, t.stale).catch((error: unknown) => error);

        await renewing.promise;
        // another replica re-paused the run on the same approval and recorded another answer
        await update(run.id, {
            status: RunStatus.QUEUED,
            waiting: a,
            claim: { owner: 'other', expiresAt: new Date(START.getTime() + 2 * TTL) },
        });

        const key = approvalDecisionKey(run.id, a.approvalId);

        expect(await t.store.effectService.findOne(key)).toBeUndefined();
        await t.store.effectService.save(key, { approved: false });
        resume.resolve();
        await answered;

        const stored = await t.store.runService.findOne(run.id);

        expect(await t.store.effectService.findOne(key)).toMatchObject({ result: { approved: false } });
        expect(stored?.claim?.owner).toBe('other');
        expect(t.errors).toEqual([]);
    });
});

describe('detached work', () => {
    it('settles its task when onError throws', async () => {
        const ctx = createEngineContext({
            onError: () => {
                throw new Error('onError failed');
            },
            isDraining: () => false,
        } as unknown as EngineContextInput);

        ctx.detach(async () => {
            throw new Error('work failed');
        });

        const tasks = [...ctx.deliveries];
        const settled = await Promise.allSettled(tasks);

        expect(tasks).toHaveLength(1);
        expect(settled.map((result) => result.status)).toEqual(['fulfilled']);
    });
});

describe('stop', () => {
    it('defers a prepare() called from an abort listener until the stop finished', async () => {
        const entered = Promise.withResolvers<void>();
        let late: Promise<void> | undefined;
        let calls = 0;
        const fake = fakeSkillRuntime({
            prepare: (signal) => new Promise<void>((_resolve, reject) => {
                calls++;

                if (calls === 1) {
                    entered.resolve();
                    signal.addEventListener('abort', () => {
                        late = engine.prepare().catch(() => {});
                        reject(signal.reason);
                    });

                    return;
                }

                // a later preparation runs until its own controller is aborted
                signal.addEventListener('abort', () => reject(signal.reason));
            }),
        });
        const engine = createTestEngine({
            services: createTestServices(),
            model: mockModel([]),
            agents: [defineModelAgent({
                name: 'test',
                instructions: 'role',
                skills: [fake.input],
            })],
        });
        const first = engine.prepare().catch(() => {});

        await entered.promise;

        let stopped = false;
        const stopping = engine.stop().then(() => {
            stopped = true;
        });

        for (let i = 0; i < 10 && !stopped; i++) {
            await flush();
        }

        expect(stopped).toBe(true);
        expect(late).toBeDefined();

        // the deferred prepare runs after the stop; a second stop ends it
        for (let i = 0; i < 10 && calls < 2; i++) {
            await flush();
        }

        expect(calls).toBe(2);
        await engine.stop();
        await Promise.all([first, stopping, late]);
    });
});
