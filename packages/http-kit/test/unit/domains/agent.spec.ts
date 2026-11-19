/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import type { PeerStartWire } from '@chamvi/http-kit';
import { json } from '../../utils/responses.ts';
import { createKitClient, linesOf } from '../../utils/kit.ts';

describe('AgentAPI', () => {
    it('posts a peer start with its role and peer fields unchanged', async () => {
        const { client, requests } = createKitClient([json({ runId: 'r', deduplicated: false }, 202)]);
        const peer: PeerStartWire = {
            standIn: 's1',
            parent: {
                runId: 'p1',
                agent: 'lead',
                depth: 1,
            },
            taint: true,
            origin: 'Ada',
        };

        await expect(client.agent.startRun('developer', {
            payload: { task: 'x' },
            idempotencyKey: 'k',
            role: 'review',
            peer,
        })).resolves.toEqual({ runId: 'r', deduplicated: false });

        expect(linesOf(requests)).toEqual(['POST /api/agents/developer/runs']);
        expect(JSON.parse(requests[0]!.body!)).toEqual({
            payload: { task: 'x' },
            idempotencyKey: 'k',
            role: 'review',
            peer,
        });
    });
});
