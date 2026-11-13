/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { App, defineCoreHandler } from 'routup';
import { isValidupError } from 'validup';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Permission } from '@chamvi/access';
import { createMemoryStore, defineModelAgent } from '@chamvi/core';
import type { Agent } from '@chamvi/core';
import { ControllableClock } from '@chamvi/test-kit';
import { http } from '@chamvi/http';
import { AgentStateService } from '../../../src/agents/service/index.ts';
import { createErrorHandler } from '../../../src/app/helpers.ts';
import type { HttpContext } from '../../../src/app/types.ts';
import { restricted } from '../../utils/app.ts';
import { inventoryAgents } from '../../utils/agents.ts';
import { textModel } from '../../utils/model.ts';
import { principalOf } from '../../utils/principal.ts';

/** The body the app's error handler answers `error` with. */
async function renderError(error: unknown): Promise<unknown> {
    const app = new App();

    app.use(defineCoreHandler(() => {
        throw error;
    }));
    app.use(createErrorHandler({ onError: () => {} } as unknown as HttpContext));

    return (await app.fetch(new Request('http://test/'))).json();
}

function setup() {
    const clock = new ControllableClock(new Date(1_000_000));
    const store = createMemoryStore({ clock });
    const agents: Agent[] = [
        ...inventoryAgents(),
        defineModelAgent({
            name: 'alfred',
            model: textModel(),
            instructions: 'Alfred.',
            channels: [http.on()],
            state: { notes: z.object({ text: z.string() }) },
            private: true,
        }),
    ];
    const service = new AgentStateService({
        agents: {
            get: (name) => agents.find((agent) => agent.name === name),
            list: () => [...agents],
            names: () => agents.map((agent) => agent.name),
        },
        store,
        clock,
    });

    return { service, store };
}

const reader = principalOf(Permission.STATE_READ);
const writer = principalOf(Permission.STATE_WRITE);

describe('AgentStateService', () => {
    it('writes, reads and lists kv entries', async () => {
        const { service } = setup();

        expect(await service.set('intake', 'cursor', { value: { a: 1 } }, writer)).toEqual({ key: 'cursor', value: { a: 1 } });
        expect(await service.get('intake', 'cursor', reader)).toEqual({ key: 'cursor', value: { a: 1 } });
        expect(await service.get('intake', 'unset', reader)).toEqual({ key: 'unset', value: null });
        expect(await service.list('intake', new URLSearchParams(), reader)).toEqual({ data: [{ key: 'cursor', value: { a: 1 } }] });
    });

    it('needs chamvi_agent_read for a private agent', async () => {
        const { service } = setup();
        const query = new URLSearchParams();

        await expect(service.list('alfred', query, reader)).rejects.toMatchObject({
            status: 403,
            message: 'State of agent "alfred" needs chamvi_agent_read.',
        });
        await expect(service.get('alfred', 'k', reader)).rejects.toMatchObject({ status: 403 });
        await expect(service.set('alfred', 'k', { value: 1 }, writer)).rejects.toMatchObject({ status: 403 });
        await expect(service.documents('alfred', 'notes', query, reader)).rejects.toMatchObject({ status: 403 });

        const granted = principalOf(Permission.STATE_READ, restricted(Permission.AGENT_READ, { name: 'alfred' }));

        expect(await service.get('alfred', 'k', granted)).toEqual({ key: 'k', value: null });
    });

    it('checks the permission before the agent lookup', async () => {
        const { service } = setup();
        const foreign = principalOf(restricted(Permission.STATE_READ, { name: 'intake' }));

        await expect(service.get('nope', 'k', foreign)).rejects.toMatchObject({
            status: 403,
            message: 'Missing permission "chamvi_state_read".',
        });
        await expect(service.get('nope', 'k', reader)).rejects.toMatchObject({
            status: 404,
            message: 'Agent "nope" was not found.',
        });
        await expect(service.set('nope', 'k', {} as never, reader)).rejects.toMatchObject({ status: 403 });
        await expect(service.set('nope', 'k', {} as never, writer)).rejects.toMatchObject({ status: 404 });
    });

    it('rejects a write without a value with a validation error', async () => {
        const { service } = setup();
        const error = await service.set('intake', 'cursor', {} as never, writer).catch((e: unknown) => e);

        expect(isValidupError(error)).toBe(true);
        expect(await renderError(error)).toMatchObject({ status: 400, code: 'validation_error' });
    });

    it('lists the documents of a declared collection', async () => {
        const { service, store } = setup();

        await store.state.upsertDocument('intake', 'issues', 'i1', { title: 'a', status: 'open' });
        await store.state.upsertDocument('intake', 'issues', 'i2', { title: 'b', status: 'closed' });

        expect(await service.documents('intake', 'issues', new URLSearchParams('filter[status]=open'), reader)).toEqual({
            data: [{
                id: 'i1',
                title: 'a',
                status: 'open',
            }],
        });
    });

    it('answers 404 for an undeclared collection, 400 for filter[id]', async () => {
        const { service } = setup();

        await expect(service.documents('intake', 'nope', new URLSearchParams(), reader)).rejects.toMatchObject({
            status: 404,
            message: 'Agent "intake" declares no state collection "nope".',
        });
        await expect(service.documents('intake', 'issues', new URLSearchParams('filter[id]=i1'), reader)).rejects.toMatchObject({ status: 400 });
    });
});
