/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { 
    describe, 
    expect, 
    it, 
    vi, 
} from 'vitest';
import { z } from 'zod';
import { defineModelAgent, defineTool } from '@chamvi/core';
import { LockService } from '../../../src/lock/index.ts';
import type { ILockService } from '../../../src/lock/index.ts';
import { deliverOnce } from '../../../src/engine/notify/module.ts';
import type { NotifyContext, NotifyDelivery } from '../../../src/engine/notify/types.ts';
import { ControllableClock } from '../../utils/clock.ts';
import { createTestEngine, createTestServices } from '../../utils/engine.ts';
import { mockModel } from '../../utils/mock-model.ts';

const TTL = 30;
const never = <T>() => new Promise<T>(() => {});

function setup(acquire: ILockService['acquire']) {
    const clock = new ControllableClock(1_000_000);
    const release = vi.fn(async () => true);
    const errors: unknown[] = [];
    const ctx: NotifyContext = {
        clock,
        lockService: { acquire, release } as unknown as ILockService,
        claimTtlMs: TTL,
        onError: (error) => {
            errors.push(error);
        },
    };
    const timeout = new Error('timeout');
    const delivery = {
        key: 'k',
        run: { id: 'r' },
        signal: new AbortController().signal,
        timeout: () => timeout,
        pending: vi.fn(async () => true),
        send: vi.fn(async () => {}),
        record: vi.fn(async () => {}),
        fail: vi.fn(),
    } as unknown as NotifyDelivery & {
        pending: ReturnType<typeof vi.fn>;
        send: ReturnType<typeof vi.fn>;
        record: ReturnType<typeof vi.fn>;
        fail: ReturnType<typeof vi.fn>;
    };

    return {
        clock, 
        ctx, 
        delivery, 
        release, 
        errors, 
        timeout,
    };
}

async function settle() {
    for (let i = 0; i < 5; i++) {
        await Promise.resolve();
    }
}

describe('deliverOnce store waits', () => {
    it('resolves when acquire never answers', async () => {
        const t = setup(() => never());
        const done = deliverOnce(t.ctx, t.delivery);

        t.clock.advance(TTL + 1);
        await done;
        expect(t.delivery.send).not.toHaveBeenCalled();
        expect(t.delivery.fail).toHaveBeenCalledWith(t.timeout, expect.any(AbortSignal));
    });

    it('resolves when pending never answers, and releases the lock', async () => {
        const t = setup(async () => 1);

        t.delivery.pending.mockImplementation(() => never());

        const done = deliverOnce(t.ctx, t.delivery);

        await settle();
        t.clock.advance(TTL + 1);
        await done;
        expect(t.delivery.send).not.toHaveBeenCalled();
        expect(t.delivery.fail).toHaveBeenCalledWith(t.timeout, expect.any(AbortSignal));
        expect(t.release).toHaveBeenCalledTimes(1);
    });

    it('resolves when record never answers, and releases the lock', async () => {
        const t = setup(async () => 1);

        t.delivery.record.mockImplementation(() => never());

        const done = deliverOnce(t.ctx, t.delivery);

        await settle();
        t.clock.advance(TTL + 1);
        await done;
        expect(t.delivery.send).toHaveBeenCalledTimes(1);
        expect(t.delivery.fail).toHaveBeenCalledWith(t.timeout, expect.any(AbortSignal));
        expect(t.release).toHaveBeenCalledTimes(1);
    });

    it('handles a record that rejects on a signal aborted as it starts', async () => {
        const t = setup(async () => 1);
        const drain = new AbortController();
        const reason = new Error('drained');
        const refused = new Error('record refused');
        const unhandled: unknown[] = [];
        const onUnhandled = (error: unknown) => {
            unhandled.push(error);
        };

        process.on('unhandledRejection', onUnhandled);

        try {
            (t.delivery as { signal: AbortSignal }).signal = drain.signal;

            let records = 0;

            // A drain lands as record starts: record sees the aborted signal and rejects.
            // A plain function, not vi.fn: the spy would observe (and so handle) the rejection.
            (t.delivery as { record: NotifyDelivery['record'] }).record = (signal) => {
                records++;
                drain.abort(reason);

                return signal.aborted ? Promise.reject(refused) : Promise.resolve();
            };

            await deliverOnce(t.ctx, t.delivery);
            await new Promise((resolve) => {
                setImmediate(resolve);
            });

            expect(records).toBe(1);
            expect(t.delivery.fail).toHaveBeenCalledWith(reason, expect.any(AbortSignal));
            expect(t.release).toHaveBeenCalledTimes(1);
            expect(unhandled).toEqual([]);
        } finally {
            process.off('unhandledRejection', onUnhandled);
        }
    });

    it('releases a lock granted after the deadline, without holding deliverOnce', async () => {
        const gate = Promise.withResolvers<number | undefined>();
        const t = setup(() => gate.promise);
        const done = deliverOnce(t.ctx, t.delivery);

        t.clock.advance(TTL + 1);
        await done;
        expect(t.release).not.toHaveBeenCalled();

        gate.resolve(1);
        await settle();
        expect(t.release).toHaveBeenCalledTimes(1);
        expect(t.release).toHaveBeenCalledWith('notify:k', expect.any(String));
        expect(t.delivery.send).not.toHaveBeenCalled();
    });

    it('reports a failed late release to onError with the run', async () => {
        const gate = Promise.withResolvers<number | undefined>();
        const t = setup(() => gate.promise);
        const failure = new Error('release failed');

        t.release.mockRejectedValue(failure);

        const done = deliverOnce(t.ctx, t.delivery);

        t.clock.advance(TTL + 1);
        await done;
        gate.resolve(1);
        await settle();
        expect(t.errors).toEqual([failure]);
    });

    it('lets engine.idle() resolve once the clock passes the deadline of a hanging lock', async () => {
        const clock = new ControllableClock(1_000_000);
        let hangs = 0;
        const store = createTestServices({
            clock,
            lockService: (lockCtx) => {
                const real = new LockService(lockCtx);

                // only the notify lock hangs; the engine's own locks keep working
                return Object.assign(Object.create(real), {
                    acquire: (key: string, owner: string, ttlMs: number) => (
                        key.startsWith('notify:') ? (hangs++, never<number | undefined>()) : real.acquire(key, owner, ttlMs)
                    ),
                }) as ILockService;
            },
        });
        const engine = createTestEngine({
            services: store,
            clock,
            claimTtlMs: TTL,
            channels: [{ name: 'slack', out: async () => {} }],
            agents: [defineModelAgent({
                name: 'release',
                instructions: 'x',
                model: mockModel([
                    {
                        parts: [{
                            type: 'tool-call', 
                            toolName: 'ask', 
                            input: {}, 
                            toolCallId: 'c1', 
                        }], 
                    },
                    { parts: [{ type: 'text', text: 'done' }] },
                ]),
                tools: {
                    ask: defineTool({
                        inputSchema: z.object({}),
                        execute: async (_input, { context }) => (await context.channels.findOneOrFail('slack').approve({
                            title: 't',
                            body: 'b',
                            address: 'C',
                        })).approved,
                    }),
                },
            })],
            onError: () => {},
        });

        await engine.start();
        await engine.dispatch({
            agent: 'release', 
            trigger: 'http', 
            channel: 'http', 
            payload: {},
        });

        let idle = false;
        const waiting = engine.idle().then(() => {
            idle = true;
        });

        await vi.waitFor(() => expect(hangs).toBe(1), { timeout: 500 });
        expect(idle).toBe(false);
        // the poll may start a further (equally hanging) attempt: each one ends at its deadline
        await vi.waitFor(() => {
            clock.advance(TTL + 1);
            expect(idle).toBe(true);
        }, { timeout: 1000 });
        await waiting;
        engine.stop();
    });
});
