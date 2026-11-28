/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PERMISSION_NAMES, Permission } from '@chamvi/access';
import { defineModelAgent } from '@chamvi/core';
import type { IConnectionHandle } from '@chamvi/core';
import { createHttpApp, http, webhook } from '@chamvi/http';
import type { App } from 'routup';
import {
    ADMIN_TOKEN,
    call,
    createTestApp,
    deployTool,
    permissionsAuth,
    restricted,
    testAuth,
    tokenFor,
} from '../../utils/app.ts';
import { callTool, connectMcp, textOf } from '../../utils/mcp.ts';
import { approvalModel, textModel } from '../../utils/model.ts';

/*
 * The permission outcome of every route (and the MCP read and approve
 * tools) per principal: status and error body, or the answer's keys and
 * row labels. Recorded on the routes as they check today; the contract
 * every later change of the checks keeps.
 */

const UNKNOWN_RUN = '00000000-0000-7000-8000-000000000000';

function fakeHandle(): IConnectionHandle {
    return {
        name: 'mail-work',
        type: 'mail',
        status: () => 'connected',
        widgets: () => [],
        subscribe: () => () => {},
        actions: {},
    };
}

function matrixAgents() {
    return [
        defineModelAgent({
            name: 'echo',
            model: textModel(),
            instructions: 'Echo.',
            channels: [http.on(), webhook.on('/hook')],
        }),
        defineModelAgent({
            name: 'vault',
            model: textModel(),
            instructions: 'Vault.',
            channels: [http.on(), webhook.on('/hook')],
            private: true,
            state: { notes: z.object({ t: z.string() }) },
        }),
        defineModelAgent({
            name: 'gate',
            model: approvalModel('deploy'),
            instructions: 'Deploy.',
            channels: [http.on()],
            tools: () => ({ deploy: deployTool() }),
        }),
        defineModelAgent({
            name: 'outside',
            model: textModel(),
            instructions: 'Outside.',
            channels: [http.on()],
        }),
    ];
}

async function setup(kind: 'full' | 'listed') {
    const connections = () => [fakeHandle()];
    const ctx = createTestApp({ agents: matrixAgents(), connections });
    const { engine } = ctx;
    const runs: Record<string, string> = {};

    for (const agent of ['echo', 'vault', 'outside', 'gate']) {
        const { runId } = await engine.dispatch({
            agent,
            trigger: 'http',
            channel: 'http',
            payload: {},
        });

        runs[agent] = runId;
    }

    await engine.start();
    await engine.idle();

    // the gate run waits on its approval, the others settled
    expect((await engine.runService.findOne(runs.gate!))?.status).toBe('waiting');

    const artifactId = '00000000-0000-7000-8000-00000000a001';

    await ctx.store.artifactService.create({
        id: artifactId,
        runId: runs.echo!,
        agent: 'echo',
        mediaType: 'text/plain',
        size: 2,
        createdAt: new Date(1_000_000),
    }, new Uint8Array([104, 105]));

    const vaultArtifactId = '00000000-0000-7000-8000-00000000a002';

    await ctx.store.artifactService.create({
        id: vaultArtifactId,
        runId: runs.vault!,
        agent: 'vault',
        mediaType: 'text/plain',
        size: 2,
        createdAt: new Date(1_000_000),
    }, new Uint8Array([104, 105]));

    for (const agent of ['echo', 'vault', 'outside']) {
        await ctx.store.stateService.set(agent, 'k', 'v');
    }

    await ctx.store.stateService.upsertDocument('vault', 'notes', 'n1', { t: 'x' });

    const app = kind === 'full' ?
        ctx.app :
        createHttpApp({
            engine,
            auth: [testAuth, permissionsAuth],
            agents: ['echo', 'vault', 'gate'],
            metrics: false,
            rateLimit: false,
            openapi: false,
            connections,
            channels: [engine.getChannel('webhook')!],
        });

    // ids to fixture labels, so the snapshot holds no generated value
    const labels: [string, string][] = [
        ...Object.entries(runs).map(([agent, id]): [string, string] => [id, `<${agent}>`]),
        [artifactId, '<artifact>'],
        [vaultArtifactId, '<vault-artifact>'],
        [UNKNOWN_RUN, '<unknown>'],
    ];

    return {
        ...ctx,
        app,
        labels,
    };
}

const PRINCIPALS: [string, string | undefined][] = [
    ['anonymous', undefined],
    ['admin', ADMIN_TOKEN],
    ['none', tokenFor()],
    ...PERMISSION_NAMES.map((name): [string, string] => [name, tokenFor(name)]),
    ['run_read{agent:echo}', tokenFor(restricted(Permission.RUN_READ, { agent: 'echo' }))],
    ['agent_read{private:false}', tokenFor(restricted(Permission.AGENT_READ, { private: false }))],
    ['agent_read{name:vault}', tokenFor(restricted(Permission.AGENT_READ, { name: 'vault' }))],
    ['agent_approve{name:gate}', tokenFor(restricted(Permission.AGENT_APPROVE, { name: 'gate' }))],
    ['run_cancel{agent:echo}', tokenFor(restricted(Permission.RUN_CANCEL, { agent: 'echo' }))],
    ['state_read{name:echo}', tokenFor(restricted(Permission.STATE_READ, { name: 'echo' }))],
    ['state_write{name:vault}', tokenFor(restricted(Permission.STATE_WRITE, { name: 'vault' }))],
    ['connection_read{type:mail}', tokenFor(restricted(Permission.CONNECTION_READ, { type: 'mail' }))],
    ['connection_write{name:other}', tokenFor(restricted(Permission.CONNECTION_WRITE, { name: 'other' }))],
    ['connection_create{type:mail}', tokenFor(restricted(Permission.CONNECTION_CREATE, { type: 'mail' }))],
    ['agent_run{name:echo}', tokenFor(restricted(Permission.AGENT_RUN, { name: 'echo' }))],
    ['agent_approve{private:false}', tokenFor(restricted(Permission.AGENT_APPROVE, { private: false }))],
    ['run_read+agent_read', tokenFor(Permission.RUN_READ, Permission.AGENT_READ)],
];

type Request = {
    method: string;
    path: string;
    body?: unknown;
    stream?: boolean;
    /** Changes state: only the status and an error body are recorded, a success varies. */
    effect?: boolean;
};

/** Paths name runs and the artifact by label; reads first, then the writes that change nothing, then the one that does. */
const REQUESTS: Request[] = [
    { method: 'GET', path: '/runs' },
    { method: 'GET', path: '/runs?filter[agent]=vault' },
    { method: 'GET', path: '/runs?filter[agent]=outside' },
    { method: 'GET', path: '/runs/<echo>' },
    { method: 'GET', path: '/runs/<vault>' },
    { method: 'GET', path: '/runs/<outside>' },
    { method: 'GET', path: '/runs/<unknown>' },
    {
        method: 'GET',
        path: '/runs/<echo>/stream?after=999',
        stream: true,
    },
    { method: 'GET', path: '/runs/<echo>/artifacts' },
    { method: 'GET', path: '/runs/<echo>/artifacts/<artifact>' },
    { method: 'GET', path: '/runs/<vault>/artifacts' },
    {
        method: 'GET',
        path: '/runs/<vault>/stream?after=999',
        stream: true,
    },
    { method: 'GET', path: '/runs/<vault>/artifacts/<vault-artifact>' },
    { method: 'GET', path: '/agents/echo/state/kv' },
    { method: 'GET', path: '/agents/vault/state/kv' },
    { method: 'GET', path: '/agents/outside/state/kv' },
    { method: 'GET', path: '/agents/missing/state/kv' },
    { method: 'GET', path: '/agents/echo/state/kv/k' },
    { method: 'GET', path: '/agents/vault/state/kv/k' },
    { method: 'GET', path: '/agents/outside/state/kv/k' },
    { method: 'GET', path: '/agents/vault/state/collections/notes' },
    { method: 'GET', path: '/agents/vault/state/collections/none' },
    { method: 'GET', path: '/agents' },
    { method: 'GET', path: '/schedules' },
    { method: 'GET', path: '/components' },
    { method: 'GET', path: '/me' },
    {
        method: 'POST',
        path: '/authorization/check',
        body: {},
    },
    { method: 'GET', path: '/connections' },
    { method: 'GET', path: '/connections/mail-work' },
    { method: 'GET', path: '/connections/unknown' },
    { method: 'GET', path: '/connections/mail-work/config' },
    {
        method: 'GET',
        path: '/connections/mail-work/events',
        stream: true,
    },
    { method: 'GET', path: '/connection-types' },
    { method: 'GET', path: '/ui-pages' },
    ...['echo', 'vault', 'outside', 'unknown'].map((run): Request => ({ method: 'POST', path: `/runs/<${run}>/cancel` })),
    {
        method: 'POST',
        path: '/agents/echo/runs',
        body: { role: 'review' },
    },
    ...['gate', 'unknown', 'vault', 'outside'].map((run): Request => ({
        method: 'POST',
        path: `/runs/<${run}>/approve`,
        body: { approvalId: 'stale', approved: true },
    })),
    {
        method: 'POST',
        path: '/runs/<gate>/approve',
        body: {},
    },
    {
        method: 'POST',
        path: '/connection-types/mail/connections',
        body: {},
    },
    {
        method: 'PUT',
        path: '/connections/mail-work/config',
        body: {},
    },
    { method: 'DELETE', path: '/connections/mail-work' },
    { method: 'POST', path: '/connections/mail-work/test' },
    { method: 'POST', path: '/connections/mail-work/reset' },
    {
        method: 'PATCH',
        path: '/agents/vault/state/kv/k',
        body: [],
    },
    {
        method: 'PATCH',
        path: '/agents/echo/state/kv/matrix',
        body: { value: 1 },
    },
    ...['outside', 'missing'].map((agent): Request => ({
        method: 'PATCH',
        path: `/agents/${agent}/state/kv/k`,
        body: { value: 1 },
        effect: true,
    })),
    ...['echo', 'vault', 'outside'].map((agent): Request => ({
        method: 'POST',
        path: `/agents/${agent}/runs`,
        body: {},
        effect: true,
    })),
    {
        method: 'POST',
        path: '/runs/<echo>/wake',
        effect: true,
    },
    ...['echo', 'vault'].map((agent): Request => ({
        method: 'POST',
        path: `/channels/webhook/${agent}/hook`,
        body: {},
        effect: true,
    })),
    // last: it cancels the waiting gate run every approve request above reads
    {
        method: 'POST',
        path: '/runs/<gate>/cancel',
        effect: true,
    },
];

/** Method and path, plus the body where two requests share a path. */
function keyOf(request: Request): string {
    const key = `${request.method} ${request.path}`;

    return request.body === undefined ? key : `${key} ${JSON.stringify(request.body)}`;
}

type Labels = [string, string][];

function labelPath(path: string, labels: Labels): string {
    return labels.reduce((out, [id, label]) => out.replaceAll(label, id), path);
}

function labelText(text: string, labels: Labels): string {
    return labels.reduce((out, [id, label]) => out.replaceAll(id, label), text);
}

type Row = Record<string, unknown>;

function rowLabel(row: Row): unknown {
    return row.agent ?? row.name ?? row.key ?? row.id;
}

async function record(app: App, request: Request, token: string | undefined, labels: Labels) {
    const controller = new AbortController();
    const response = await call(app, request.method, labelPath(request.path, labels), {
        ...(token ? { token } : {}),
        ...(request.body === undefined ? {} : { body: request.body }),
        ...(request.stream ? { headers: { accept: 'text/event-stream' }, signal: controller.signal } : {}),
    });

    if (request.stream) {
        controller.abort();
        await response.body?.cancel().catch(() => undefined);

        return { status: response.status };
    }

    if (request.effect && response.status >= 200 && response.status < 300) {
        await response.body?.cancel();

        return { status: response.status };
    }

    const contentType = response.headers.get('content-type') ?? '';

    if (!contentType.includes('json')) {
        return { status: response.status, body: { contentType, size: (await response.arrayBuffer()).byteLength } };
    }

    const text = labelText(await response.text(), labels);
    const json = text ? JSON.parse(text) as Row & { data?: Row[] } : undefined;

    if (response.status < 200 || response.status >= 300) {
        return { status: response.status, body: json };
    }

    return { status: response.status, body: summarize(json) };
}

/** A success answer as its keys and row labels: no timestamp or generated id. */
function summarize(json: (Row & { data?: Row[]; meta?: Row }) | undefined) {
    // a listing's total: `meta.total` over http, `total` from the MCP tools
    const total = json?.meta?.total ?? json?.total;

    return {
        keys: json ? Object.keys(json).sort() : [],
        rows: Array.isArray(json?.data) ? json.data.map(rowLabel) : undefined,
        ...(total === undefined ? {} : { total }),
    };
}

/** A tool result: an error's text verbatim, a success summarized as an http answer. */
function toolCell(isError: boolean, text: string) {
    if (isError || !text.startsWith('{')) {
        return { isError, text };
    }

    return { isError, ...summarize(JSON.parse(text) as Row & { data?: Row[] }) };
}

type ToolCall = [label: string, name: string, args: Record<string, unknown>];

/** The read and approve calls, then (in a second pass over every principal) one start, so no listing sees it. */
function mcpCalls(labels: Labels): ToolCall[][] {
    const id = (label: string) => labels.find(([, l]) => l === label)![0];

    return [
        [
            ['get_run <echo>', 'get_run', { runId: id('<echo>') }],
            ['get_run <vault>', 'get_run', { runId: id('<vault>') }],
            ['get_run <outside>', 'get_run', { runId: id('<outside>') }],
            ['get_run <unknown>', 'get_run', { runId: UNKNOWN_RUN }],
            ['list_runs {}', 'list_runs', {}],
            ['list_runs {agent:vault}', 'list_runs', { agent: 'vault' }],
            ['list_runs {agent:outside}', 'list_runs', { agent: 'outside' }],
            ['approve_run stale', 'approve_run', {
                runId: id('<gate>'),
                approvalId: 'stale',
                approved: true,
            }],
        ],
        [['run_echo', 'run_echo', {}]],
    ];
}

async function recordMcp(app: App, token: string | undefined, labels: Labels, calls: ToolCall[], cells: Record<string, unknown>) {
    let client: Awaited<ReturnType<typeof connectMcp>>;

    try {
        client = await connectMcp(app, token);
    } catch {
        cells.connect = 'refused';

        return;
    }

    cells['tools/list'] = (await client.listTools()).tools.map((tool) => tool.name).sort();

    for (const [label, name, args] of calls) {
        try {
            const result = await callTool(client, name, args);

            cells[label] = toolCell(result.isError ?? false, labelText(textOf(result), labels));
        } catch (error) {
            // a tool the principal is not offered is a protocol error
            cells[label] = { rejected: (error as Error).message };
        }
    }

    await client.close();
}

describe('permission matrix', () => {
    for (const kind of ['full', 'listed'] as const) {
        it(`pins every route's outcome per principal (${kind})`, async () => {
            const { app, labels } = await setup(kind);
            const cells: Record<string, unknown> = {};

            for (const request of REQUESTS) {
                for (const [principal, token] of PRINCIPALS) {
                    cells[`${kind} ${principal} ${keyOf(request)}`] = await record(app, request, token, labels);
                }
            }

            expect(cells).toMatchSnapshot();
        });
    }

    for (const kind of ['full', 'listed'] as const) {
        it(`pins the MCP read and approve tools per principal (${kind})`, async () => {
            const { app, labels } = await setup(kind);
            const cells: Record<string, Record<string, unknown>> = {};

            for (const calls of mcpCalls(labels)) {
                for (const [principal, token] of PRINCIPALS) {
                    await recordMcp(app, token, labels, calls, cells[`mcp ${principal}`] ??= {});
                }
            }

            expect(cells).toMatchSnapshot();
        });
    }
});
