/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readFileSync } from 'node:fs';
import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { ControllableClock } from '@chamvi/test-kit';
import { createPeers } from '../fixtures/readme-example.ts';
import { createFakeFetch, json } from '../utils/fetch.ts';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const TOKEN = 'readme-peer-token-0123456789';

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('README example', () => {
    it('is the code of test/fixtures/readme-example.ts', () => {
        const readme = read('../../README.md');
        const blocks = readme.matchAll(/```typescript\n([\s\S]*?)```/g).map((m) => m[1]).toArray();

        expect(blocks).toContain(read('../fixtures/readme-example.ts'));
    });

    it('recognizes dev and starts a run there with the token', async () => {
        vi.stubEnv('CHAMVI_PEER_DEV_TOKEN', TOKEN);

        const fake = createFakeFetch(() => json({ runId: 'remote-1', deduplicated: false }, { status: 201 }));
        const peers = createPeers({ clock: new ControllableClock(0), fetch: fake.fetch });

        expect(peers.recognize({
            kind: 'token',
            id: 'peer-dev',
            bindings: [],
        })).toBe('dev');
        expect(peers.settings('dev')).toMatchObject({ outgoing: true, pollMs: 60_000 });
        expect(peers.approvalUrl?.({ runId: 'r1', approvalId: 'a1' })).toBe('https://assistants.example/ui/approvals?run=r1&approval=a1');

        await expect(peers.transport('dev').start({
            agent: 'developer',
            role: 'default',
            payload: { task: 'review' },
            idempotencyKey: 'stand-in-1',
            peer: {
                standIn: 'stand-in-1',
                parent: {
                    runId: 'stand-in-1', 
                    agent: 'developer', 
                    depth: 0, 
                },
                taint: false,
            },
        }, { signal: new AbortController().signal })).resolves.toEqual({ runId: 'remote-1' });

        expect(fake.at(0).url).toBe('https://dev.example/agents/developer/runs');
        expect(fake.at(0).headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
    });

    it('refuses to build without the token', () => {
        vi.stubEnv('CHAMVI_PEER_DEV_TOKEN', '');

        expect(() => createPeers()).toThrow('Set CHAMVI_PEER_DEV_TOKEN.');
    });
});
