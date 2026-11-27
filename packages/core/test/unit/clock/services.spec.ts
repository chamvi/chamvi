/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONVERSATION_LIMITS } from '@chamvi/core';
import type { Run } from '@chamvi/core-kit';
import { ControllableClock } from '../../utils/clock.ts';
import { createTestServices } from '../../utils/engine.ts';

describe('services on one clock', () => {
    it('uses the supplied clock for run claims, keys, locks and conversation snapshots', async () => {
        const clock = new ControllableClock(new Date('2026-01-01T00:00:00Z'));
        const services = createTestServices({ clock });
        const run: Run = {
            id: 'run',
            agent: 'agent',
            status: 'queued',
            trigger: {
                id: 'trigger',
                agent: 'agent',
                trigger: 'test',
                channel: 'test',
                payload: {},
                receivedAt: new Date(clock.now()),
            },
            usage: {
                inputTokens: 0,
                outputTokens: 0,
            },
            createdAt: new Date(clock.now()),
            updatedAt: new Date(clock.now()),
        };

        await services.runService.create(run);
        expect(await services.runService.claim('run', 'first', 10)).toBe(true);
        expect(await services.idempotencyService.claim('scope', 'key', 'first', 10)).toEqual({ created: true, runId: 'first' });
        expect(await services.lockService.acquire('lock', 'first', 10)).toBeTypeOf('number');

        clock.advance(9);
        expect(await services.runService.claim('run', 'second', 10)).toBe(false);
        expect(await services.idempotencyService.claim('scope', 'key', 'second', 10)).toEqual({ created: false, runId: 'first' });
        expect(await services.lockService.acquire('lock', 'second', 10)).toBeUndefined();

        clock.advance(1);
        expect(await services.runService.claim('run', 'second', 10)).toBe(true);
        expect(await services.idempotencyService.claim('scope', 'key', 'second', 10)).toEqual({ created: true, runId: 'second' });
        expect(await services.lockService.acquire('lock', 'second', 10)).toBeTypeOf('number');
        expect((await services.runService.update('run', { status: 'running' })).updatedAt).toEqual(new Date(clock.now()));

        const scope = await services.conversationService.resolve({
            agent: 'agent',
            channel: 'test',
            account: 'account',
            chat: 'chat',
            audience: 'direct',
        });

        expect(await services.conversationService.beginTurn(scope, 'run', 'hello', DEFAULT_CONVERSATION_LIMITS)).toMatchObject({
            kind: 'ready',
            snapshot: { createdAt: new Date(clock.now()) },
        });
    });
});
