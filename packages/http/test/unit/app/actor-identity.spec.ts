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
import { Permission } from '@chamvi/access';
import type { PermissionAuthorization, PermissionBinding } from '@chamvi/access';
import type { Principal } from '@chamvi/http';
import { toInvoker } from '../../../src/auth/helpers/index.ts';
import {
    ADMIN_TOKEN,
    approvalIdOf,
    call,
    createRunTestApp,
    testAuth,
} from '../../utils/app.ts';

const READ: PermissionBinding[] = [
    { permission: { name: Permission.RUN_READ } },
    { permission: { name: Permission.STATE_READ } },
];

// a well-formed authorization structuredClone() refuses (a function inside); without an identity `can` reads the bindings
const UNCLONEABLE = {
    realm: '0195f2a0-7c3e-7a4b-9c1d-000000000001',
    snapshot: { definitions: [] },
    hook: () => undefined,
} as unknown as PermissionAuthorization;

function principalOf(token: string, bindings: PermissionBinding[]): Principal | undefined {
    if (token === 'plain') {
        return {
            id: 'custom', 
            kind: 'custom', 
            bindings, 
        };
    }

    if (token === 'uncloneable') {
        return {
            id: 'custom',
            kind: 'custom',
            bindings,
            authorization: UNCLONEABLE,
        };
    }

    return undefined;
}

/** The run app with the two custom principals (and the admin token), one started run of `agent`, settled. */
async function setup(bindings: PermissionBinding[], agent: string) {
    const ctx = createRunTestApp({ auth: [async (request) => principalOf(/^Bearer (.*)$/.exec(request.headers.get('authorization') ?? '')?.[1] ?? '', bindings), testAuth] });
    const response = await call(ctx.app, 'POST', `/agents/${agent}/runs`, { token: ADMIN_TOKEN });
    const { runId } = await response.json() as { runId: string };

    await ctx.engine.start();
    await ctx.engine.idle();

    return { ...ctx, runId };
}

async function outcomeOf(response: Response): Promise<[number, unknown]> {
    return [response.status, await response.json()];
}

describe('the actor identity', () => {
    it('answers reads of a principal with an uncloneable authorization as of a plain one', async () => {
        const {
            app,
            engine,
            store,
            runId,
        } = await setup(READ, 'echo');

        await store.stateService.set('echo', 'k', 'v');

        for (const path of [`/runs/${runId}`, '/runs/0195f2a0-7c3e-7a4b-9c1d-2e3f4a5b6c7d', '/agents/echo/state/kv/k', '/agents/echo/state/kv']) {
            const plain = await outcomeOf(await call(app, 'GET', path, { token: 'plain' }));

            expect(plain[0]).not.toBe(500);
            expect(await outcomeOf(await call(app, 'GET', path, { token: 'uncloneable' }))).toEqual(plain);
        }

        await engine.drain();
    });

    it('answers a refused approve with the 403 and 404, never a 500', async () => {
        const {
            app,
            engine,
            store,
            runId,
        } = await setup(READ, 'gate');

        const body = { approvalId: await approvalIdOf(store, runId), approved: true };

        for (const path of [`/runs/${runId}/approve`, '/runs/0195f2a0-7c3e-7a4b-9c1d-2e3f4a5b6c7d/approve']) {
            const plain = await outcomeOf(await call(app, 'POST', path, { token: 'plain', body }));

            expect([403, 404]).toContain(plain[0]);
            expect(await outcomeOf(await call(app, 'POST', path, { token: 'uncloneable', body }))).toEqual(plain);
        }

        await engine.drain();
    });

    it('passes the principal as the approver', async () => {
        const bindings = [...READ, { permission: { name: Permission.AGENT_APPROVE } }];
        const {
            app,
            engine,
            store,
            runId,
        } = await setup(bindings, 'gate');

        const approve = vi.spyOn(engine, 'approve');
        const response = await call(app, 'POST', `/runs/${runId}/approve`, {
            token: 'plain',
            body: { approvalId: await approvalIdOf(store, runId), approved: true },
        });

        expect(response.status).toBe(202);
        expect(approve.mock.calls[0]?.[1].approver).toEqual(toInvoker(principalOf('plain', bindings)!));
        await engine.idle();
        await engine.drain();
    });
});
