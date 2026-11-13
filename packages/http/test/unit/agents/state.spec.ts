/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { Permission } from '@chamvi/access';
import { z } from 'zod';
import { defineModelAgent } from '@chamvi/core';
import { http } from '@chamvi/http';
import {
    ADMIN_TOKEN,
    READER_TOKEN,
    call,
    createTestApp,
    restricted,
    tokenFor,
} from '../../utils/app.ts';
import { textModel } from '../../utils/model.ts';
import { inventoryAgents } from '../../utils/agents.ts';

function setup() {
    const agents = [
        ...inventoryAgents(),
        defineModelAgent({
            name: 'loose',
            model: textModel(),
            instructions: 'Loose.',
            channels: [http.on()],
        }),
    ];

    return createTestApp({ agents });
}

const KV = '/agents/intake/state/kv/cursor';
const ISSUES = '/agents/intake/state/collections/issues';

describe('state kv', () => {
    it('writes and reads a value', async () => {
        const { app } = setup();
        const written = await call(app, 'PATCH', KV, { token: ADMIN_TOKEN, body: { value: { a: 1 } } });

        expect(written.status).toBe(200);
        expect(await written.json()).toEqual({ key: 'cursor', value: { a: 1 } });

        const read = await call(app, 'GET', KV, { token: ADMIN_TOKEN });

        expect(await read.json()).toEqual({ key: 'cursor', value: { a: 1 } });
    });

    it('reads an unset key as null', async () => {
        const { app } = setup();

        expect(await (await call(app, 'GET', KV, { token: ADMIN_TOKEN })).json()).toEqual({ key: 'cursor', value: null });
    });

    it('accepts null and rejects a missing value or a non-object body', async () => {
        const { app } = setup();

        expect((await call(app, 'PATCH', KV, { token: ADMIN_TOKEN, body: { value: null } })).status).toBe(200);
        expect((await call(app, 'PATCH', KV, { token: ADMIN_TOKEN, body: {} })).status).toBe(400);
        expect((await call(app, 'PATCH', KV, { token: ADMIN_TOKEN, body: [1] })).status).toBe(400);
        expect((await call(app, 'PATCH', KV, { token: ADMIN_TOKEN })).status).toBe(400);
    });

    it('needs chamvi_state_read and chamvi_state_write', async () => {
        const { app } = setup();

        expect((await call(app, 'GET', KV, { token: READER_TOKEN })).status).toBe(403);
        expect((await call(app, 'GET', KV, { token: tokenFor(Permission.STATE_READ) })).status).toBe(200);
        expect((await call(app, 'PATCH', KV, { token: tokenFor(Permission.STATE_READ), body: { value: 1 } })).status).toBe(403);
        expect((await call(app, 'PATCH', KV, { token: tokenFor(Permission.STATE_WRITE), body: { value: 1 } })).status).toBe(200);
        expect((await call(app, 'GET', KV)).status).toBe(401);
    });

    it('checks a restricted state grant against the agent name, before the lookup', async () => {
        const { app } = setup();
        const intake = tokenFor(restricted(Permission.STATE_READ, { name: 'intake' }));
        const other = tokenFor(restricted(Permission.STATE_READ, { name: 'echo' }));
        const refused = await call(app, 'GET', KV, { token: other });

        expect((await call(app, 'GET', KV, { token: intake })).status).toBe(200);
        expect(refused.status).toBe(403);
        expect((await refused.json()).message).toBe('Missing permission "chamvi_state_read".');
        // an unknown agent is refused like a foreign one
        expect((await call(app, 'GET', '/agents/nope/state/kv/x', { token: intake })).status).toBe(403);
    });

    it('answers 404 for an unknown agent', async () => {
        const { app } = setup();

        expect((await call(app, 'GET', '/agents/nope/state/kv/x', { token: ADMIN_TOKEN })).status).toBe(404);
        expect((await call(app, 'PATCH', '/agents/nope/state/kv/x', { token: ADMIN_TOKEN, body: { value: 1 } })).status).toBe(404);
        expect((await call(app, 'GET', '/agents/nope/state/collections/x', { token: ADMIN_TOKEN })).status).toBe(404);
    });
});

describe('state of a private agent', () => {
    function privateSetup() {
        return createTestApp({
            agents: [defineModelAgent({
                name: 'alfred',
                model: textModel(),
                instructions: 'Alfred.',
                channels: [http.on()],
                state: { notes: z.object({ text: z.string() }) },
                private: true,
            })],
        });
    }

    const paths = [
        '/agents/alfred/state/kv',
        '/agents/alfred/state/kv/cursor',
        '/agents/alfred/state/collections/notes',
    ];

    it('needs chamvi_agent_read besides chamvi_state_read', async () => {
        const { app } = privateSetup();

        for (const path of paths) {
            const denied = await call(app, 'GET', path, { token: tokenFor(Permission.STATE_READ) });

            expect(denied.status, path).toBe(403);
            expect((await denied.json()).message).toBe('State of agent "alfred" needs chamvi_agent_read.');
            expect((await call(app, 'GET', path, { token: tokenFor(Permission.STATE_READ, restricted(Permission.AGENT_READ, { name: 'alfred' })) })).status, path).toBe(200);
            expect((await call(app, 'GET', path, { token: ADMIN_TOKEN })).status, path).toBe(200);
        }
    });

    it('needs chamvi_agent_read besides chamvi_state_write', async () => {
        const { app } = privateSetup();
        const path = '/agents/alfred/state/kv/cursor';

        expect((await call(app, 'PATCH', path, { token: tokenFor(Permission.STATE_WRITE), body: { value: 1 } })).status).toBe(403);
        expect((await call(app, 'PATCH', path, { token: tokenFor(Permission.STATE_WRITE, restricted(Permission.AGENT_READ, { name: 'alfred' })), body: { value: 1 } })).status).toBe(200);
    });
});

describe('state kv listing', () => {
    const LIST = '/agents/intake/state/kv';

    it('lists kv entries in key order with a page', async () => {
        const { app, store } = setup();

        await store.state.set('intake', 'b', 2);
        await store.state.set('intake', 'B', 'upper');
        await store.state.set('intake', 'a', { n: 1 });
        await store.state.set('echo', 'x', true);

        const all = await call(app, 'GET', LIST, { token: tokenFor(Permission.STATE_READ) });

        expect(all.status).toBe(200);
        expect(await all.json()).toEqual({
            data: [
                { key: 'B', value: 'upper' },
                { key: 'a', value: { n: 1 } },
                { key: 'b', value: 2 },
            ],
        });

        const page = await call(app, 'GET', `${LIST}?page[limit]=1&page[offset]=1`, { token: tokenFor(Permission.STATE_READ) });

        expect(await page.json()).toEqual({ data: [{ key: 'a', value: { n: 1 } }] });
    });

    it('403 without chamvi_state_read', async () => {
        const { app } = setup();

        expect((await call(app, 'GET', LIST, { token: READER_TOKEN })).status).toBe(403);
    });

    it('404 for an unknown agent', async () => {
        const { app } = setup();

        expect((await call(app, 'GET', '/agents/nope/state/kv', { token: ADMIN_TOKEN })).status).toBe(404);
    });

    it.each([
        'page[limit]=101',
        'page[offset]=-1',
        'filter[key]=a',
        'sort=key',
    ])('400 for %s', async (query) => {
        const { app } = setup();

        expect((await call(app, 'GET', `${LIST}?${query}`, { token: ADMIN_TOKEN })).status).toBe(400);
    });
});

describe('state collections', () => {
    async function seeded() {
        const ctx = setup();

        await ctx.store.state.upsertDocument('intake', 'issues', 'i1', {
            title: 'a',
            status: 'open',
            priority: 2,
        });
        await ctx.store.state.upsertDocument('intake', 'issues', 'i2', {
            title: 'b',
            status: 'closed',
            priority: 1,
        });

        return ctx;
    }

    it('lists documents with their ids', async () => {
        const { app } = await seeded();
        const response = await call(app, 'GET', ISSUES, { token: ADMIN_TOKEN });

        expect(response.status).toBe(200);

        const { data } = await response.json();

        expect(data).toHaveLength(2);
        expect(data).toContainEqual({
            id: 'i1',
            title: 'a',
            status: 'open',
            priority: 2,
        });
    });

    it('filters by top-level equality', async () => {
        const { app } = await seeded();
        const open = await (await call(app, 'GET', `${ISSUES}?filter[status]=open`, { token: ADMIN_TOKEN })).json();

        expect(open.data).toEqual([{
            id: 'i1',
            title: 'a',
            status: 'open',
            priority: 2,
        }]);

        const coerced = await (await call(app, 'GET', `${ISSUES}?filter[priority]=2`, { token: ADMIN_TOKEN })).json();

        expect(coerced.data.map((d: { id: string }) => d.id)).toEqual(['i1']);
    });

    it('matches a string that looks like a scalar when the value is double-quoted', async () => {
        const { app, store } = setup();

        await store.state.upsertDocument('intake', 'issues', 'a', { issue: '42', tag: 'true' });
        await store.state.upsertDocument('intake', 'issues', 'b', { issue: 42, tag: 'null' });
        await store.state.upsertDocument('intake', 'issues', 'c', { issue: '007', tag: '"x"' });

        const ids = async (query: string) => {
            const response = await call(app, 'GET', `${ISSUES}?${query}`, { token: ADMIN_TOKEN });

            expect(response.status).toBe(200);

            return (await response.json()).data.map((d: { id: string }) => d.id);
        };

        expect(await ids('filter[issue]=42')).toEqual(['b']);
        expect(await ids('filter[issue]="42"')).toEqual(['a']);
        expect(await ids('filter[issue]="007"')).toEqual(['c']);
        expect(await ids('filter[tag]="true"')).toEqual(['a']);
        expect(await ids('filter[tag]="null"')).toEqual(['b']);
        expect(await ids('filter[tag]=""x""')).toEqual(['c']);
    });

    it('limits the page', async () => {
        const { app } = await seeded();
        const page = await (await call(app, 'GET', `${ISSUES}?page[limit]=1`, { token: ADMIN_TOKEN })).json();

        expect(page.data).toHaveLength(1);
    });

    it('lists a collection named kv on an agent without a state schema', async () => {
        const { app, store } = setup();

        await store.state.upsertDocument('loose', 'kv', 'k1', { a: 1 });

        const response = await call(app, 'GET', '/agents/loose/state/collections/kv', { token: ADMIN_TOKEN });

        expect(response.status).toBe(200);
        expect((await response.json()).data).toEqual([{ id: 'k1', a: 1 }]);
    });

    it('answers 404 for a collection the agent does not declare', async () => {
        const { app } = setup();
        const response = await call(app, 'GET', '/agents/intake/state/collections/nope', { token: ADMIN_TOKEN });

        expect(response.status).toBe(404);
        expect((await response.json()).message).toBe('Agent "intake" declares no state collection "nope".');
    });

    it.each([
        'filter[a.b]=1',
        'filter[id]=i1',
        'filter[status]=!open',
        'filter[status]=open,closed',
        'sort=id',
        'page[limit]=101',
        'page[limit]=1&page[offset]=1',
    ])('rejects %s', async (query) => {
        const { app } = await seeded();
        const response = await call(app, 'GET', `${ISSUES}?${query}`, { token: ADMIN_TOKEN });

        expect(response.status).toBe(400);
    });

    it('names the equality rule', async () => {
        const { app } = await seeded();
        const response = await call(app, 'GET', `${ISSUES}?filter[status]=!open`, { token: ADMIN_TOKEN });

        expect((await response.json()).message).toBe('Only top-level equality filters are supported.');
    });

    it('needs chamvi_state_read', async () => {
        const { app } = await seeded();

        expect((await call(app, 'GET', ISSUES, { token: READER_TOKEN })).status).toBe(403);
        expect((await call(app, 'GET', ISSUES, { token: tokenFor(Permission.STATE_READ) })).status).toBe(200);
    });
});

describe('state path parameters', () => {
    it('decodes a percent-encoded key', async () => {
        const { app } = setup();
        const slash = await call(app, 'GET', '/agents/echo/state/kv/a%2Fb', { token: ADMIN_TOKEN });

        expect(slash.status).toBe(200);
        expect(await slash.json()).toEqual({ key: 'a/b', value: null });

        const space = await call(app, 'GET', '/agents/echo/state/kv/%20', { token: ADMIN_TOKEN });

        expect(space.status).toBe(200);
        expect(await space.json()).toEqual({ key: ' ', value: null });
    });

    it('matches the agent name case-sensitively', async () => {
        const { app } = setup();
        const response = await call(app, 'GET', '/agents/ECHO/state/kv', { token: ADMIN_TOKEN });

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({
            status: 404,
            code: 'not_found',
            message: 'Agent "ECHO" was not found.',
        });
    });
});
