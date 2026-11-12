/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { Permission } from '@chamvi/access';
import {
    call,
    createRunTestApp,
    restricted,
    tokenFor,
} from '../../utils/app.ts';
import { callTool, connectMcp } from '../../utils/mcp.ts';

describe('mcp invoker', () => {
    it('run_<agent> records the principal as the invoker; get_run drops its permissions', async () => {
        const setup = createRunTestApp();
        const token = tokenFor(restricted(Permission.AGENT_RUN, { name: 'echo' }));
        const client = await connectMcp(setup.app, token);
        const result = await callTool(client, 'run_echo', {});

        expect(result.isError).toBeFalsy();

        const { runId } = result.structuredContent as { runId: string };

        expect((await setup.store.runs.findOne(runId))?.trigger.invoker).toEqual({
            id: 'p:chamvi_agent_run',
            kind: 'token',
            permissions: [restricted(Permission.AGENT_RUN, { name: 'echo' })],
        });

        const read = await callTool(client, 'get_run', { runId });

        expect(read.isError).toBeFalsy();
        expect((read.structuredContent as { trigger: { invoker: unknown } }).trigger.invoker).toEqual({
            id: 'p:chamvi_agent_run',
            kind: 'token',
        });
        await client.close();
    });

    it('approve_run records the approver on the wait step', async () => {
        const setup = createRunTestApp();
        const response = await call(setup.app, 'POST', '/agents/gate/runs', { token: tokenFor(restricted(Permission.AGENT_RUN, { name: 'gate' })) });
        const { runId } = await response.json() as { runId: string };

        await setup.engine.start();
        await setup.engine.idle();

        const client = await connectMcp(setup.app, tokenFor(restricted(Permission.AGENT_APPROVE, { name: 'gate' })));
        const result = await callTool(client, 'approve_run', {
            runId,
            approvalId: await setup.approvalIdOf(runId),
            approved: false,
            reason: 'no',
        });

        expect(result.isError).toBeFalsy();
        await setup.engine.idle();

        const wait = (await setup.store.steps.find(runId)).find((s) => s.kind === 'wait');

        expect((wait?.output as { approver?: unknown }).approver).toEqual({
            id: 'p:chamvi_agent_approve',
            kind: 'token',
            permissions: [restricted(Permission.AGENT_APPROVE, { name: 'gate' })],
        });
        await client.close();
        await setup.engine.drain();
    });
});
