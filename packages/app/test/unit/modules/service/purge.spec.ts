/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ControllableClock } from '@chamvi/test-kit';
import { expect, it } from 'vitest';
import { createPurgeComponent } from '../../../../src/modules/service/purge.ts';
import { createRecordingLogger } from '../../../utils/logger.ts';

const flush = () => new Promise<void>((resolve) => {
    setImmediate(resolve);
});

it('waits for every capability purge after one fails, before stopping or rearming', async () => {
    const clock = new ControllableClock();
    const logger = createRecordingLogger(clock);
    const first = Promise.withResolvers<number>();
    const second = Promise.withResolvers<number>();
    let calls = 0;
    const component = createPurgeComponent({
        services: [
            {
                purgeExpired: () => {
                    calls++;

                    return first.promise;
                },
            },
            {
                purgeExpired: () => {
                    calls++;

                    return second.promise;
                },
            },
        ],
        clock,
        logger,
        intervalMs: 100,
    });

    await component.start();
    clock.advance(100);
    expect(calls).toBe(2);
    first.reject(new Error('first failed'));
    await flush();
    clock.advance(500);
    expect(calls).toBe(2);

    let stopped = false;
    // a shutdown (the component group) stops, then awaits settled()
    const stopping = component.stop().then(() => component.settled()).then(() => {
        stopped = true;
    });

    await flush();
    expect(stopped).toBe(false);
    second.resolve(3);
    await stopping;
    expect(stopped).toBe(true);
    expect(logger.entries.filter((entry) => entry.level === 'error')).toHaveLength(1);
    clock.advance(500);
    expect(calls).toBe(2);
});

it('records a pass in which a purge failed as failed, after logging it once, and a fully successful pass as a success', async () => {
    const clock = new ControllableClock(1_000);
    const logger = createRecordingLogger(clock);
    let fail = true;
    const component = createPurgeComponent({
        services: [
            {
                purgeExpired: async () => {
                    if (fail) {
                        throw new Error('lock purge failed');
                    }

                    return 1;
                },
            },
            { purgeExpired: async () => 2 },
        ],
        clock,
        logger,
        intervalMs: 100,
    });

    await component.start();
    clock.advance(100);
    await component.settled();

    const errors = logger.entries.filter((entry) => entry.level === 'error');

    expect(errors).toHaveLength(1);
    expect(errors[0]!.error).toMatchObject({ message: 'lock purge failed' });
    expect(component.status()).toMatchObject({ lastErrorAt: 1_100, lastRunAt: 1_100 });
    expect(component.status().lastSuccessAt).toBeUndefined();

    fail = false;
    clock.advance(100);
    await component.settled();

    expect(component.status()).toMatchObject({ lastSuccessAt: 1_200, lastErrorAt: 1_100 });
    expect(logger.entries.filter((entry) => entry.level === 'error')).toHaveLength(1);
    await component.stop();
});

it('runs one pass, not a burst, when the clock jumps past many intervals', async () => {
    const clock = new ControllableClock();
    const logger = createRecordingLogger(clock);
    let calls = 0;
    const component = createPurgeComponent({
        services: [
            {
                purgeExpired: async () => {
                    calls++;

                    return 0;
                },
            },
        ],
        clock,
        logger,
        intervalMs: 100,
    });

    await component.start();
    clock.advance(100 * 50);
    await component.settled();
    await flush();
    expect(calls).toBe(1);

    // the next pass waits one interval from the moment the last one settled
    clock.advance(99);
    expect(calls).toBe(1);
    clock.advance(1);
    expect(calls).toBe(2);
    await component.stop();
    await component.settled();
});
