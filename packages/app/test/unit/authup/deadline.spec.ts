/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ITokenVerifier } from '@authup/server-adapter-kit';
import { TimeoutError } from '@chamvi/core';
import { describe, expect, it } from 'vitest';
import { boundVerifier, withDeadline } from '../../../src/authup/deadline.ts';
import { createTrackingClock } from '../../utils/clock.ts';

const flush = () => new Promise((resolve) => {
    setImmediate(resolve);
});

function deferred<T>() {
    return Promise.withResolvers<T>();
}

describe('withDeadline', () => {
    it('answers a fast call and leaves no timer behind', async () => {
        const clock = createTrackingClock();

        await expect(withDeadline(clock, 1000, 'catalog', async () => 'ok')).resolves.toBe('ok');
        expect(clock.active()).toBe(0);
    });

    it('passes a fast rejection through and leaves no timer behind', async () => {
        const clock = createTrackingClock();
        const failure = new Error('down');

        await expect(withDeadline(clock, 1000, 'catalog', async () => {
            throw failure;
        })).rejects.toBe(failure);
        expect(clock.active()).toBe(0);
    });

    it('passes a synchronous throw through', async () => {
        const clock = createTrackingClock();
        const failure = new Error('sync');

        await expect(withDeadline(clock, 1000, 'catalog', () => {
            throw failure;
        })).rejects.toBe(failure);
        expect(clock.active()).toBe(0);
    });

    it('rejects with TimeoutError once timeoutMs passed, naming the call', async () => {
        const clock = createTrackingClock();
        const stalled = deferred<string>();
        const outcome = withDeadline(clock, 1000, 'catalog', () => stalled.promise);

        clock.advance(999);
        await flush();
        clock.advance(1);

        await expect(outcome).rejects.toBeInstanceOf(TimeoutError);
        await expect(outcome).rejects.toThrow('authup: the catalog did not answer within 1000ms.');
        expect(clock.active()).toBe(0);
    });

    it('swallows a late rejection of the abandoned call', async () => {
        const clock = createTrackingClock();
        const stalled = deferred<string>();
        const unhandled: unknown[] = [];
        const listener = (reason: unknown) => {
            unhandled.push(reason);
        };

        process.on('unhandledRejection', listener);

        try {
            const outcome = withDeadline(clock, 10, 'realm', () => stalled.promise);

            clock.advance(10);
            await expect(outcome).rejects.toBeInstanceOf(TimeoutError);

            stalled.reject(new Error('late'));
            await flush();
            await flush();

            expect(unhandled).toEqual([]);
        } finally {
            process.off('unhandledRejection', listener);
        }
    });
});

describe('boundVerifier', () => {
    it('bounds each verification and keeps a fast answer', async () => {
        const clock = createTrackingClock();
        const stalled = deferred<never>();
        const verifier: ITokenVerifier = { verify: async (token) => (token === 'fast' ? { sub: 'u' } as never : stalled.promise) };
        const bounded = boundVerifier(verifier, clock, 500);

        await expect(bounded.verify('fast')).resolves.toEqual({ sub: 'u' });
        expect(clock.active()).toBe(0);

        const slow = bounded.verify('slow');

        clock.advance(500);
        await expect(slow).rejects.toBeInstanceOf(TimeoutError);
    });
});
