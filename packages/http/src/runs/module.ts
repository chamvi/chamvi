/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Permission } from '@chamvi/access';
import { AgentReplacedError } from '@chamvi/core';
import type { Agent, ChannelSubscription, Run } from '@chamvi/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { defineCoreHandler } from 'routup';
import type { App, IAppEvent } from 'routup';
import { requireAgent } from '../agents/helpers.ts';
import type { HttpContext } from '../app/types.ts';
import {
    agentResource,
    authenticate,
    authorize,
    forbidden,
    isGranted,
    toInvoker,
} from '../auth/helpers.ts';
import { HTTP_CHANNEL_NAME } from '../channels/constants.ts';
import {
    readIdempotencyHeader,
    readJsonBody,
    validateBody,
    validatePayload,
} from '../request/helpers.ts';
import {
    assertCanListRuns,
    contentDisposition,
    createApproveContainer,
    createStartRunContainer,
    loadApprovableRun,
    loadReadableRun,
    loadRunArtifact,
    parseRunListQuery,
    requireHttpSubscription,
    serializeRun,
    serializeStep,
    toBody,
} from './helpers.ts';
import { START_RUN_MAX_ATTEMPTS } from './constants.ts';
import { streamRun } from './stream/module.ts';

function param(event: IAppEvent, name: string): string {
    return event.params[name] ?? '';
}

/** The run, once the principal may read it: 401, then 404, then 403. */
async function readableRun(event: IAppEvent, ctx: HttpContext, id: string): Promise<Run> {
    return loadReadableRun(ctx, await authenticate(event, ctx), id);
}

/**
 * `POST /agents/:name/runs`, `GET /runs`, `GET /runs/:id`, `GET /runs/:id/stream`,
 * `GET /runs/:id/artifacts`, `GET /runs/:id/artifacts/:artifactId`, `POST /runs/:id/cancel`, `POST /runs/:id/approve`.
 */
export function registerRunRoutes(app: App, ctx: HttpContext): void {
    const startContainer = createStartRunContainer();
    const approveContainer = createApproveContainer();

    app.post('/agents/:name/runs', defineCoreHandler(async (event) => {
        const name = param(event, 'name');
        const principal = await authenticate(event, ctx);
        // the agent registered under `name` now, checked before the 404 (an agent the app
        // does not hold counts as private), and its http subscription
        const resolve = async (): Promise<{ agent: Agent; subscription: ChannelSubscription }> => {
            const current = ctx.agents.get(name);

            if (!await isGranted(principal, Permission.AGENT_RUN, ctx.clock, agentResource(name, current))) {
                throw forbidden(Permission.AGENT_RUN);
            }

            const agent = current ?? requireAgent(ctx.agents, name);

            return { agent, subscription: requireHttpSubscription(agent) };
        };

        // read after authentication, so the check sees the agent as registered now
        let { agent, subscription } = await resolve();

        const body = await validateBody(startContainer, await readJsonBody(event, ctx.bodyLimit));
        const idempotencyKey = body.idempotencyKey ?? readIdempotencyHeader(event.request);
        let payload = await validatePayload(subscription.options.schema as StandardSchemaV1 | undefined, body.payload);

        let result: { runId: string; deduplicated: boolean } | undefined;

        for (let attempt = 1; result === undefined; attempt++) {
            // replaced or removed while the body was read and validated: check the
            // replacement and validate against its schema, until the agent stays
            while (ctx.agents.get(name) !== agent) {
                ({ agent, subscription } = await resolve());
                payload = await validatePayload(subscription.options.schema as StandardSchemaV1 | undefined, body.payload);
            }

            try {
                result = await ctx.engine.dispatch({
                    agent: name,
                    trigger: subscription.id,
                    channel: HTTP_CHANNEL_NAME,
                    payload,
                    ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
                    ...(body.address !== undefined ? { address: body.address } : {}),
                    ...(body.attachments?.length ? { attachments: body.attachments } : {}),
                    invoker: toInvoker(principal),
                    // the agent checked above: a replacement since is refused before any store write
                    checked: agent,
                });
            } catch (error) {
                // replaced at the dispatch: the loop checks the replacement, a bounded number of times (then 409)
                if (!(error instanceof AgentReplacedError) || attempt >= START_RUN_MAX_ATTEMPTS) {
                    throw error;
                }
            }
        }

        event.response.status = 202;

        return result;
    }));

    app.get('/runs', defineCoreHandler(async (event) => {
        const principal = await authenticate(event, ctx);
        const query = parseRunListQuery(event.searchParams, ctx.agents.names());

        const agents = await assertCanListRuns(ctx, principal, query.agent);
        const {
            parent,
            waiting,
            ...options
        } = query;
        const { data, total } = await ctx.store.runs.find({
            ...options,
            ...(agents !== undefined ? { agents } : {}),
            parentRunId: parent,
            waitKind: waiting,
        });

        return {
            data: data.map((run) => serializeRun(run, ctx.agents)),
            meta: {
                total,
                limit: query.limit,
                offset: query.offset,
            },
        };
    }));

    app.get('/runs/:id', defineCoreHandler(async (event) => {
        const run = await readableRun(event, ctx, param(event, 'id'));

        return { ...serializeRun(run, ctx.agents), steps: (await ctx.store.steps.find(run.id)).map(serializeStep) };
    }));

    app.get('/runs/:id/stream', defineCoreHandler(async (event) => {
        const run = await readableRun(event, ctx, param(event, 'id'));

        return streamRun(event, ctx, run.id);
    }));

    app.get('/runs/:id/artifacts', defineCoreHandler(async (event) => {
        const run = await readableRun(event, ctx, param(event, 'id'));

        return { data: await ctx.store.artifacts.find(run.id) };
    }));

    app.get('/runs/:id/artifacts/:artifactId', defineCoreHandler(async (event) => {
        const run = await readableRun(event, ctx, param(event, 'id'));
        const { artifact, data } = await loadRunArtifact(ctx, run, param(event, 'artifactId'));
        // from the response headers, so CORS and RateLimit-* survive
        const headers = new Headers(event.response.headers);

        headers.set('content-type', artifact.mediaType);
        headers.set('content-length', String(data.byteLength));
        headers.set('content-disposition', contentDisposition(artifact.filename));
        // a stored text/html or image/svg+xml must never render as a page of this origin
        headers.set('x-content-type-options', 'nosniff');
        headers.set('cache-control', 'private, no-store');

        return new Response(toBody(data), { status: 200, headers });
    }));

    app.post('/runs/:id/cancel', defineCoreHandler(async (event) => {
        const principal = await authorize(event, ctx, Permission.RUN_CANCEL);
        const id = param(event, 'id');
        const target = await ctx.store.runs.findOne(id);

        // a missing run is the engine's 404
        if (target && !await isGranted(principal, Permission.RUN_CANCEL, ctx.clock, { agent: target.agent })) {
            throw forbidden(Permission.RUN_CANCEL);
        }

        await ctx.engine.cancel(id);

        const run = await ctx.engine.getRun(id);

        event.response.status = 202;

        return { runId: id, status: run?.status };
    }));

    app.post('/runs/:id/approve', defineCoreHandler(async (event) => {
        // authorize against the run's agent before reading the body
        const principal = await authenticate(event, ctx);
        const run = await loadApprovableRun(ctx, principal, param(event, 'id'));
        const body = await validateBody(approveContainer, await readJsonBody(event, ctx.bodyLimit), { required: true });

        await ctx.engine.approve(run.id, {
            approvalId: body.approvalId,
            approved: body.approved,
            ...(body.reason !== undefined ? { reason: body.reason } : {}),
            ...(body.selected !== undefined ? { selected: body.selected } : {}),
            approver: toInvoker(principal),
        });
        event.response.status = 202;

        return { runId: run.id, status: 'queued' };
    }));
}
