/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { utilityTools } from '@chamvi/tool-utils';
import { runTool } from '../../utils/run.ts';

describe('run_info', () => {
    const tools = utilityTools({ env: {}, include: ['run_info'] });
    const info = (options: Parameters<typeof runTool>[3]) => runTool(tools, 'run_info', {}, options);

    it('cron run has scheduledAt from payload.scheduledAt', async () => {
        const result = await info({
            trigger: {
                channel: 'cron', 
                trigger: 'daily', 
                payload: { scheduledAt: '2026-11-09T08:00:00.000Z' }, 
            },
        });

        expect(result).toMatchObject({
            agent: 'utility-test',
            channel: 'cron',
            subscription: 'daily',
            scheduledAt: '2026-11-09T08:00:00.000Z',
        });
        expect(result).toHaveProperty('runId');
        expect(result).toHaveProperty('receivedAt');
    });

    it('custom cron payload omits scheduledAt', async () => {
        const result = await info({ trigger: { channel: 'cron', payload: { other: 1 } } });

        expect(result).not.toHaveProperty('scheduledAt');
    });

    it('cron payload with an unparsable scheduledAt omits it', async () => {
        const result = await info({ trigger: { channel: 'cron', payload: { scheduledAt: 'soon' } } });

        expect(result).not.toHaveProperty('scheduledAt');
    });

    it('a webhook-shaped run with payload.scheduledAt omits it', async () => {
        const result = await info({ trigger: { channel: 'webhook', payload: { scheduledAt: '2026-11-09T08:00:00.000Z' } } });

        expect(result).not.toHaveProperty('scheduledAt');
    });

    it('chat run has address and invoker { kind, id, name }', async () => {
        const result = await info({
            trigger: {
                channel: 'chat',
                address: 'thread-1',
                invoker: {
                    kind: 'user', 
                    id: 'u1', 
                    name: 'Ada', 
                    permissions: [], 
                },
            },
        });

        expect(result).toMatchObject({
            address: 'thread-1',
            invoker: {
                kind: 'user', 
                id: 'u1', 
                name: 'Ada', 
            }, 
        });
    });

    it('dispatched run has parent { agent, role, depth }', async () => {
        const result = await info({
            parent: {
                kind: 'dispatch', 
                agent: 'boss', 
                role: 'helper', 
                depth: 2, 
            },
        });

        expect((result as { parent: unknown }).parent).toEqual({
            agent: 'boss', 
            role: 'helper', 
            depth: 2, 
        });
    });

    it('the serialized result holds no planted secret', async () => {
        const result = await info({
            trigger: {
                channel: 'cron',
                payload: { scheduledAt: '2026-11-09T08:00:00.000Z', token: 'tok-secret' },
                idempotencyKey: 'idem-secret',
                concurrencyKey: 'conc-secret',
                invoker: {
                    kind: 'user', 
                    id: 'u1', 
                    permissions: ['secret:perm'], 
                },
            },
            parent: {
                kind: 'dispatch',
                agent: 'boss',
                role: 'helper',
                depth: 1,
                source: { channel: 'chat', address: 'src-secret' },
            },
        });
        const text = JSON.stringify(result);

        for (const secret of ['tok-secret', 'secret:perm', 'idem-secret', 'conc-secret', 'src-secret']) {
            expect(text).not.toContain(secret);
        }
    });
});
