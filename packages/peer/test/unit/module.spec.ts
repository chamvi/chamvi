/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError, defineRemoteAgent } from '@chamvi/core';
import type { Agent, IPeerResolver } from '@chamvi/core';
import { ControllableClock } from '@chamvi/test-kit';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import {
    AppToken,
    ModuleName,
    configModule,
    createApp,
    createLogger,
    engineModule,
} from '@chamvi/app';
import type { IApp, IModule } from '@chamvi/app';
import { buildModuleHarness, memoryStoreModule } from '@chamvi/app/testing';
import type { ModuleHarness } from '@chamvi/app/testing';
import { peerModule } from '@chamvi/peer/module';
import { PeerRequestError } from '@chamvi/peer';
import type { PeerOptions } from '@chamvi/peer';
import { createFakeFetch } from '../utils/fetch.ts';

const NOW = new Date('2026-11-19T00:00:00Z');
const TOKEN = 'outgoing-secret-0123456789';
const PEERS: Record<string, PeerOptions> = { billing: { url: 'https://billing.example', outgoing: { token: TOKEN } } };

let harnesses: ModuleHarness[] = [];
let apps: IApp[] = [];

afterEach(async () => {
    await Promise.all(harnesses.map((harness) => harness.stop()));
    await Promise.all(apps.map((app) => app.stop().catch(() => {})));
    harnesses = [];
    apps = [];
});

const silent = (clock: ControllableClock) => createLogger({ clock, write: () => undefined });

function invoice(peer = 'billing'): Agent {
    return defineRemoteAgent({ name: 'invoice', peer });
}

function harnessOf(options: {
    modules: IModule[];
    agents?: Agent[];
    env?: Record<string, string>;
    check?: boolean;
}) {
    const clock = new ControllableClock(NOW);
    const harness = buildModuleHarness({
        clock,
        env: options.env ?? {},
        agents: options.agents ?? [],
        ...(options.check !== undefined && { check: options.check }),
        modules: [
            configModule({ clock, logger: silent(clock) }),
            memoryStoreModule(),
            engineModule(),
            ...options.modules,
        ],
    });

    harnesses.push(harness);

    return { harness, clock };
}

async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
    try {
        await promise;
    } catch (error) {
        return error as Error;
    }

    throw new Error('expected a rejection');
}

function peersOf(harness: ModuleHarness): IPeerResolver {
    return harness.container.resolve(AppToken.PEERS);
}

describe('peerModule', () => {
    it('is named and depends on config', () => {
        const peers = peerModule({ peers: PEERS });

        expect(peers.name).toBe('chamvi:peer');
        expect(peers.dependencies).toEqual([ModuleName.CONFIG]);
    });

    it('checks the peer options when called', () => {
        expect(() => peerModule({ peers: { Billing: { url: 'https://billing.example' } } }))
            .toThrow(InvalidAgentDefinitionError);
    });

    it('registers PEERS and the engine gets it', async () => {
        const { harness } = harnessOf({ agents: [invoice()], modules: [peerModule({ peers: PEERS })] });

        await harness.setup();

        const peers = peersOf(harness);

        expect(peers.has('billing')).toBe(true);
        expect(harness.container.resolve(AppToken.ENGINE).peers).toBe(peers);
    });

    it('takes the approval link from PUBLIC_URL', async () => {
        const { harness } = harnessOf({
            env: { PUBLIC_URL: 'https://agents.example' },
            modules: [peerModule({ peers: PEERS })],
        });

        await harness.setup();

        expect(peersOf(harness).approvalUrl?.({ runId: 'r1', approvalId: '0:c1:0' }))
            .toBe('https://agents.example/ui/approvals?run=r1&approval=0%3Ac1%3A0');
    });

    it('carries no approval link without PUBLIC_URL', async () => {
        const { harness } = harnessOf({ modules: [peerModule({ peers: PEERS })] });

        await harness.setup();

        expect(peersOf(harness).approvalUrl).toBeUndefined();
    });

    it('runs the resolver on the app clock', async () => {
        const fake = createFakeFetch(() => new Response(JSON.stringify({ code: 'busy', message: 'Busy.' }), {
            status: 503,
            headers: { 'content-type': 'application/json', 'retry-after': new Date(NOW.getTime() + 90_000).toUTCString() },
        }));
        const { harness } = harnessOf({ modules: [peerModule({ peers: PEERS, fetch: fake.fetch })] });

        await harness.setup();

        const error = await rejectionOf(peersOf(harness).transport('billing').read('remote-1', { signal: new AbortController().signal }));

        expect(error).toBeInstanceOf(PeerRequestError);
        expect((error as PeerRequestError & { retryAfterMs?: number }).retryAfterMs).toBe(90_000);
    });

    it('a remote agent naming an unconfigured peer fails a check, naming the agent and the peer', async () => {
        const { harness } = harnessOf({
            check: true,
            agents: [invoice('ledger')],
            modules: [peerModule({ peers: PEERS })],
        });

        const error = await rejectionOf(harness.setup());

        expect(error).toBeInstanceOf(InvalidAgentDefinitionError);
        expect(error.message).toBe('Agent "invoice" names unknown peer "ledger".');
    });

    it('IApp.check() refuses a remote agent naming an unconfigured peer, and passes a configured one', async () => {
        const clock = new ControllableClock(NOW);
        const env = {
            TOKENS: JSON.stringify([{
                value: 'a-static-token-of-length',
                id: 'ops',
                permissions: '*',
            }]),
        };
        const appOf = (agent: Agent) => {
            const app = createApp({
                agents: [agent],
                modules: [configModule({ clock, logger: silent(clock) }), memoryStoreModule(), peerModule({ peers: PEERS })],
            });

            apps.push(app);

            return app;
        };

        const error = await rejectionOf(appOf(invoice('ledger')).check({ env }));

        expect(error).toBeInstanceOf(InvalidAgentDefinitionError);
        expect(error.message).toContain('Agent "invoice" names unknown peer "ledger"');

        await expect(appOf(invoice()).check({ env })).resolves.toEqual({ issues: [] });
    });
});
