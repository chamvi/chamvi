/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { normalizeEnvelope } from '@chamvi/store';

const receivedAt = new Date(1_000);

describe('normalizeEnvelope', () => {
    it('fills channel from source and address from thread and drops the legacy keys', () => {
        const raw = {
            id: 'e1',
            agent: 'a',
            trigger: 'github:issues',
            source: 'github',
            thread: 'x',
            payload: { n: 1 },
            receivedAt,
        };

        const envelope = normalizeEnvelope(raw);

        expect(envelope).toEqual({
            id: 'e1',
            agent: 'a',
            trigger: 'github:issues',
            channel: 'github',
            address: 'x',
            payload: { n: 1 },
            receivedAt,
        });
        expect('source' in envelope).toBe(false);
        expect('thread' in envelope).toBe(false);
        expect(raw).toHaveProperty('source', 'github');
    });

    it('keeps channel and address when present', () => {
        const envelope = normalizeEnvelope({
            id: 'e1',
            agent: 'a',
            trigger: 'http',
            channel: 'http',
            address: 'new',
            source: 'mcp',
            thread: 'old',
            payload: null,
            receivedAt,
        });

        expect(envelope.channel).toBe('http');
        expect(envelope.address).toBe('new');
        expect('source' in envelope).toBe(false);
        expect('thread' in envelope).toBe(false);
    });

    it('leaves address absent without thread or address', () => {
        const envelope = normalizeEnvelope({
            id: 'e1',
            agent: 'a',
            trigger: 'cron',
            source: 'cron',
            payload: null,
            receivedAt,
        });

        expect(envelope.channel).toBe('cron');
        expect('address' in envelope).toBe(false);
    });
});
