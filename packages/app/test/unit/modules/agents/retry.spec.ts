/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ControllableClock } from '@chamvi/test-kit';
import { describe, expect, it } from 'vitest';
import { createRetryLoop } from '../../../../src/modules/agents/retry.ts';
import type { RetryEntry } from '../../../../src/modules/agents/types.ts';
import { createRecordingLogger } from '../../../utils/logger.ts';

const POLL_MS = 1_000;

/** A ControllableClock that tells how many timers are armed. */
class CountingClock extends ControllableClock {
    get pending(): number {
        return this.timers.length;
    }
}

const flush = () => new Promise<void>((resolve) => {
    setImmediate(resolve);
});

/**
 * A loop whose retry of an entry runs `onRetry` (default: succeeds and
 * deletes the entry), recording each retried name with the time.
 */
function build(onRetry?: (name: string, loop: ReturnType<typeof createRetryLoop>) => Promise<void>) {
    const clock = new CountingClock(10_000);
    const logger = createRecordingLogger(clock);
    const retried: Array<{ name: string; at: number }> = [];
    const loop = createRetryLoop({
        name: 'agents-packages',
        clock,
        pollMs: POLL_MS,
        logger,
        retry: async (name) => {
            retried.push({ name, at: clock.now() });

            if (onRetry) {
                await onRetry(name, loop);
            } else {
                loop.delete(name);
            }
        },
    });

    return {
        clock,
        logger,
        loop,
        retried,
        /** Advances by `ms`, then waits for the pass it started. */
        async advance(ms: number) {
            clock.advance(ms);
            await loop.component.settled?.();
            await flush();
        },
    };
}

describe('the retry loop', () => {
    it('arms no timer when started without a pending retry', async () => {
        const { clock, loop } = build();

        await loop.component.start();
        expect(clock.pending).toBe(0);
        await loop.component.stop();
    });

    it('waits for the poll tick of the earliest retry and keeps each backoff', async () => {
        // fails twice, doubling its delay as the packages do, then succeeds
        let failures = 2;
        const setup = build(async (name, loop) => {
            const previous = loop.get(name)!;

            if (failures-- > 0) {
                const delay = previous.delay * 2;

                loop.set(name, { delay, at: setup.clock.now() + delay } satisfies RetryEntry);

                return;
            }

            loop.delete(name);
        });
        const {
            clock, 
            loop, 
            retried, 
        } = setup;

        loop.set('skilled', { delay: 2 * POLL_MS, at: clock.now() + 2 * POLL_MS });
        await loop.component.start();

        // first tick: nothing due, then the loop waits for the tick of the retry
        await setup.advance(POLL_MS);
        expect(retried).toEqual([]);

        const firstPass = loop.component.status().lastRunAt;

        await setup.advance(POLL_MS);
        expect(retried).toEqual([{ name: 'skilled', at: 12_000 }]);

        // the next retry is due 4 polls later: no pass runs on the ticks between
        for (let i = 0; i < 3; i++) {
            await setup.advance(POLL_MS);
        }

        expect(retried).toHaveLength(1);
        expect(loop.component.status().lastRunAt).toBe(12_000);
        await setup.advance(POLL_MS);
        expect(retried.map((entry) => entry.at)).toEqual([12_000, 16_000]);

        // then 8 polls later, after which nothing is pending and no timer is armed
        await setup.advance(7 * POLL_MS);
        expect(retried).toHaveLength(2);
        await setup.advance(POLL_MS);
        expect(retried.map((entry) => entry.at)).toEqual([12_000, 16_000, 24_000]);
        expect(clock.pending).toBe(0);
        expect(firstPass).toBe(11_000);
        await loop.component.stop();
    });

    it('starts again when a retry is added after every one succeeded', async () => {
        const setup = build();
        const {
            clock, 
            loop, 
            retried, 
        } = setup;

        loop.set('a', { delay: POLL_MS, at: clock.now() + POLL_MS });
        await loop.component.start();
        await setup.advance(POLL_MS);
        expect(retried.map((entry) => entry.name)).toEqual(['a']);
        expect(clock.pending).toBe(0);

        loop.set('b', { delay: 2 * POLL_MS, at: clock.now() + 2 * POLL_MS });
        await flush();
        expect(clock.pending).toBe(1);
        // the restarted loop's first tick finds nothing due, the next one retries b
        await setup.advance(POLL_MS);
        expect(retried.map((entry) => entry.name)).toEqual(['a']);
        await setup.advance(POLL_MS);
        expect(retried.map((entry) => entry.name)).toEqual(['a', 'b']);
        expect(clock.pending).toBe(0);
        await loop.component.stop();
    });

    it('keeps running when a retry is added while the last pending retry is in flight', async () => {
        const release = Promise.withResolvers<void>();
        const setup = build(async (name, loop) => {
            if (name === 'a') {
                await release.promise;
            }

            loop.delete(name);
        });
        const {
            clock, 
            loop, 
            retried, 
        } = setup;

        loop.set('a', { delay: POLL_MS, at: clock.now() + POLL_MS });
        await loop.component.start();
        clock.advance(POLL_MS);
        expect(retried.map((entry) => entry.name)).toEqual(['a']);

        // added while the pass that settles the last pending retry is in flight
        loop.set('b', { delay: POLL_MS, at: clock.now() + POLL_MS });
        release.resolve();
        await loop.component.settled?.();
        await flush();
        expect(clock.pending).toBe(1);

        await setup.advance(POLL_MS);
        expect(retried.map((entry) => entry.name)).toEqual(['a', 'b']);
        expect(clock.pending).toBe(0);
        await loop.component.stop();
    });

    it('does not start again once stopped, and reports stopped', async () => {
        const setup = build();
        const {
            clock, 
            loop, 
            retried, 
        } = setup;

        loop.set('a', { delay: POLL_MS, at: clock.now() + POLL_MS });
        await loop.component.start();
        await loop.component.stop();
        expect(loop.stopped()).toBe(true);

        loop.set('b', { delay: POLL_MS, at: clock.now() + POLL_MS });
        await setup.advance(10 * POLL_MS);
        expect(retried).toEqual([]);
        expect(clock.pending).toBe(0);
    });

    it('logs a failed retry once, records the pass as failed and retries on the next tick', async () => {
        let fail = true;
        const setup = build(async (name, loop) => {
            if (fail) {
                fail = false;

                throw new Error('store down');
            }

            loop.delete(name);
        });
        const {
            clock,
            loop,
            logger,
            retried,
        } = setup;

        loop.set('a', { delay: POLL_MS, at: clock.now() + POLL_MS });
        await loop.component.start();
        await setup.advance(POLL_MS);

        expect(logger.entries.filter((entry) => entry.level === 'error').map((entry) => entry.msg)).toEqual(['agent reload failed']);
        expect(loop.component.status()).toMatchObject({ lastErrorAt: 11_000 });
        expect(loop.component.status().lastSuccessAt).toBeUndefined();

        await setup.advance(POLL_MS);
        expect(retried.map((entry) => entry.at)).toEqual([11_000, 12_000]);
        expect(loop.component.status().lastSuccessAt).toBe(12_000);
        expect(logger.entries.filter((entry) => entry.level === 'error')).toHaveLength(1);
        await loop.component.stop();
    });
});
