/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { z } from 'zod';
import {
    Engine,
    approve,
    createMemoryStore,
    defineModelAgent,
    defineTool,
} from '@chamvi/core';
import type {
    Agent,
    ApprovalWaitPoint,
    ChannelSubscription,
    IChannel,
    IStore,
    Run,
} from '@chamvi/core';
import { ControllableClock } from '@chamvi/test-kit';
import {
    createHttpApp,
    http,
    httpChannel,
    mcpChannel,
    staticTokens,
    webhook,
    webhookChannel,
} from '@chamvi/http';
import type { HttpAppOptions, Principal } from '@chamvi/http';
import { Permission } from '@chamvi/access';
import type { PermissionBinding } from '@chamvi/access';
import type { App } from 'routup';
import { approvalModel, textModel } from './model.ts';


export const ADMIN_TOKEN = 'admin-token-0123456789';
export const READER_TOKEN = 'reader-token-0123456789';

/** Admin and reader principals by bearer token. */
export const testAuth = staticTokens({
    tokens: [
        {
            value: ADMIN_TOKEN,
            id: 'admin',
            permissions: '*',
        },
        {
            value: READER_TOKEN,
            id: 'reader',
            permissions: [{ permission: { name: Permission.RUN_READ } }],
        },
    ],
});

export type TestAppOverrides = Partial<Omit<HttpAppOptions, 'agents'>> & {
    /** Engine construction, ignored when `engine` is given. */
    agents?: Agent[];
    store?: IStore;
    clock?: ControllableClock;
    /** Channels the engine holds besides `http`, `mcp`, `webhook` and the `cron` stub. */
    engineChannels?: IChannel<any, any>[];
};

export function createTestApp(overrides: TestAppOverrides = {}) {
    const {
        agents: agentsOverride,
        store: storeOverride,
        clock: clockOverride,
        engineChannels = [],
        engine: engineOverride,
        ...options
    } = overrides;
    // a given engine brings its own clock, the only one the app reads
    const clock = (engineOverride?.clock as ControllableClock | undefined) ??
        clockOverride ??
        new ControllableClock(new Date(1_000_000));
    const channels = testChannels();
    const hooks = channels.find((channel) => channel.name === 'webhook')!;
    const engine = engineOverride ?? new Engine({
        store: storeOverride ?? createMemoryStore({ clock }),
        agents: agentsOverride ?? [
            defineModelAgent({
                name: 'echo',
                model: textModel(),
                instructions: 'Echo.',
                channels: [http.on()],
            }),
        ],
        clock,
        channels: [...channels, ...engineChannels],
        onError: () => {},
    });
    const app = createHttpApp({
        auth: [testAuth, permissionsAuth],
        metrics: false,
        rateLimit: false,
        // off unless a spec asks: a missing built document would be reported to `onError`
        openapi: false,
        // a given engine brings its own channels
        ...(engineOverride ? {} : { channels: [hooks] }),
        ...options,
        engine,
    });

    return {
        app,
        engine,
        store: engine.store,
        clock,
        agents: engine.listAgents(),
    };
}

export type CallOptions = {
    token?: string;
    body?: unknown;
    headers?: Record<string, string>;
    signal?: AbortSignal;
};

export function call(app: App, method: string, path: string, options: CallOptions = {}): Promise<Response> {
    const headers = new Headers({ accept: 'application/json', ...options.headers });

    if (options.token) {
        headers.set('authorization', `Bearer ${options.token}`);
    }

    let body: string | undefined;

    if (options.body !== undefined) {
        body = JSON.stringify(options.body);

        if (!headers.has('content-type')) {
            headers.set('content-type', 'application/json');
        }
    }

    return app.fetch(new Request(`http://test${path}`, {
        method,
        headers,
        body,
        signal: options.signal,
    }));
}

/** `http`, `mcp`, `webhook` (over the test authenticators) and the `cron` stub, fresh per call. */
export function testChannels(): IChannel<any, any>[] {
    return [httpChannel(), mcpChannel(), webhookChannel({ auth: [testAuth, permissionsAuth] }), cronStub()];
}

/** A channel named `cron` without behaviour, so agents can carry cron subscriptions. */
export function cronStub(): IChannel {
    return { name: 'cron' };
}

/** A cron subscription as `@chamvi/channel-cron`'s `cron.on()` builds it. */
export function cronOn(
    expression: string,
    options: { timezone?: string; overlap?: 'skip' | 'queue-one' | 'allow' } = {},
): ChannelSubscription {
    return {
        channel: 'cron',
        id: `cron:${expression}`,
        options: {
            expression,
            timezone: options.timezone,
            overlap: options.overlap ?? 'skip',
        },
    };
}

/** A `deploy` tool that asks for an approval (no channel) before it deploys. */
export function deployTool() {
    return defineTool({
        inputSchema: z.object({}),
        execute: async (_input, { context }) => {
            const decision = await approve(context, { title: 'Deploy?', body: 'release 1.2' });

            return decision.approved ? 'deployed' : 'denied';
        },
    });
}

/** A `pick` tool that asks to choose one of two options (no channel). */
export function pickTool() {
    return defineTool({
        inputSchema: z.object({}),
        execute: async (_input, { context }) => {
            const decision = await approve(context, {
                title: 'Pick?',
                options: [{ id: 'a', label: 'A' }, {
                    id: 'b',
                    label: 'B',
                    detail: 'diff',
                }],
            });

            return decision.approved ? `picked ${decision.selected?.join(',')}` : 'denied';
        },
    });
}

/** The bytes `shotsTool()` puts under both keys. */
export const SHOTS_PNG = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);

/** A `shots` tool that puts two keyed images and asks with them on the request and an option. */
export function shotsTool() {
    return defineTool({
        inputSchema: z.object({}),
        execute: async (_input, { context }) => {
            const overview = await context.artifacts.put({
                key: 'overview',
                mediaType: 'image/png',
                filename: 'overview.png',
                data: SHOTS_PNG,
            });
            const diff = await context.artifacts.put({
                key: 'button/diff',
                mediaType: 'image/png',
                filename: 'button-diff.png',
                data: SHOTS_PNG,
            });
            const decision = await approve(context, {
                title: 'Accept?',
                artifacts: [overview.id],
                options: [{
                    id: 'button',
                    label: 'Button',
                    artifacts: [diff.id],
                }, { id: 'none', label: 'None' }],
            });

            return decision.approved ? 'accepted' : 'denied';
        },
    });
}

/** `shots` (http, `shots` asks with keyed images); not part of `createRunAgents()`. */
export function shotsAgent(): Agent {
    return defineModelAgent({
        name: 'shots',
        model: approvalModel('shots'),
        instructions: 'Shots.',
        channels: [http.on()],
        tools: () => ({ shots: shotsTool() }),
    });
}

/** The run's approval wait point; throws without one or for another kind. */
export function approvalWaitOf(run: Pick<Run, 'id' | 'waiting'> | undefined): ApprovalWaitPoint {
    if (run?.waiting?.kind !== 'approval') {
        throw new Error(`run ${run?.id} is not waiting on an approval`);
    }

    return run.waiting;
}

/** The approval id the run's current wait point waits on. */
export async function approvalIdOf(store: IStore, runId: string): Promise<string> {
    return approvalWaitOf(await store.runs.findOne(runId)).approvalId;
}

/**
 * `echo` (http, text), `gate` (http, `deploy` asks for an approval),
 * `choose` (http, `pick` asks to choose an option),
 * `sweep` (cron only) and `hooked` (webhook only); fresh models per call.
 */
export function createRunAgents(): Agent[] {
    return [
        defineModelAgent({
            name: 'echo',
            model: textModel(),
            instructions: 'Echo.',
            channels: [http.on()],
        }),
        defineModelAgent({
            name: 'gate',
            model: approvalModel('deploy'),
            instructions: 'Deploy.',
            channels: [http.on()],
            tools: () => ({ deploy: deployTool() }),
        }),
        defineModelAgent({
            name: 'choose',
            model: approvalModel('pick'),
            instructions: 'Choose.',
            channels: [http.on()],
            tools: () => ({ pick: pickTool() }),
        }),
        defineModelAgent({
            name: 'sweep',
            model: textModel(),
            instructions: 'Sweep.',
            channels: [cronOn('0 * * * *')],
        }),
        defineModelAgent({
            name: 'hooked',
            model: textModel(),
            instructions: 'Hooked.',
            channels: [webhook.on('/x')],
        }),
    ];
}

/** `createTestApp` over `createRunAgents()`, with `approvalIdOf(runId)` for paused runs. */
export function createRunTestApp(overrides: TestAppOverrides = {}) {
    const setup = createTestApp({
        agents: createRunAgents(),
        ...overrides,
    });

    return { ...setup, approvalIdOf: (runId: string) => approvalIdOf(setup.store, runId) };
}

/** A grant `tokenFor` takes: a name (an unrestricted binding) or a binding. */
export type TestGrant = string | PermissionBinding;

function toBinding(grant: TestGrant): PermissionBinding {
    return typeof grant === 'string' ? { permission: { name: grant } } : grant;
}

/** A binding of `name` restricted by one `attributes` policy over the resource. */
export function restricted(name: string, query: Record<string, unknown>): PermissionBinding {
    return {
        permission: { name },
        policies: [{ type: 'attributes', query } as never],
    };
}

/**
 * An authenticator that maps `Bearer p:<base64url JSON bindings>` to a
 * principal holding those bindings, id `p:<names joined by ,>`.
 */
export async function permissionsAuth(request: Request): Promise<Principal | undefined> {
    const match = /^Bearer p:(.*)$/.exec(request.headers.get('authorization') ?? '');

    if (!match) {
        return undefined;
    }

    const bindings = match[1] ? JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8')) as PermissionBinding[] : [];

    return {
        id: `p:${bindings.map((binding) => binding.permission.name).join(',')}`,
        kind: 'token',
        bindings,
    };
}

/** The bearer token `permissionsAuth` reads as exactly these grants. */
export function tokenFor(...grants: TestGrant[]): string {
    if (grants.length === 0) {
        return 'p:';
    }

    return `p:${Buffer.from(JSON.stringify(grants.map(toBinding))).toString('base64url')}`;
}

/** Waits until every pending microtask and immediate ran. */
export function flush(): Promise<void> {
    return new Promise((resolve) => {
        setImmediate(resolve);
    });
}
