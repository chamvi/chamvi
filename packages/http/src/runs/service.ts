/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Permission } from '@chamvi/access';
import type {
    Agent,
    ChannelSubscription,
    DispatchEnvelope,
} from '@chamvi/core';
import type { Artifact, Run } from '@chamvi/store';
import { and, defineQuery, inArray } from '@rapiq/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { Container } from 'validup';
import { requireAgent } from '../agents/helpers.ts';
import {
    agentResource,
    assertGranted,
    forbidden,
    isGranted,
    toInvoker,
} from '../auth/helpers.ts';
import type { Principal } from '../auth/types.ts';
import { HTTP_CHANNEL_NAME } from '../channels/constants.ts';
import { readIdempotencyHeader, validateBody, validatePayload } from '../request/helpers.ts';
import {
    assertCanListRuns,
    createApproveContainer,
    createStartRunContainer,
    loadApprovableRun,
    loadReadableRun,
    loadRunArtifact,
    parseRunListQuery,
    requireHttpSubscription,
    serializeRun,
    serializeStep,
    toRunListRequest,
} from './helpers.ts';
import type {
    ApproveBody,
    ApproveRunView,
    CancelRunView,
    DispatchRunInput,
    IRunHttpService,
    RunArtifactView,
    RunDetailView,
    RunFindFilter,
    RunFindView,
    RunHttpServiceContext,
    RunListRequest,
    RunListView,
    StartRunBody,
    StartRunInput,
    StartRunView,
} from './types.ts';

/** Starts, reads, cancels and answers runs over core's run, step and artifact services. */
export class RunHttpService implements IRunHttpService {
    protected ctx: RunHttpServiceContext;

    protected startContainer: Container<StartRunBody>;

    protected approveContainer: Container<ApproveBody>;

    constructor(ctx: RunHttpServiceContext) {
        this.ctx = ctx;
        this.startContainer = createStartRunContainer();
        this.approveContainer = createApproveContainer();
    }

    async start(input: StartRunInput, principal: Principal): Promise<StartRunView> {
        const name = input.agent;
        const { agent, subscription } = await this.resolveStart(name, principal);

        const body = await validateBody(this.startContainer, input.data);
        const idempotencyKey = body.idempotencyKey ?? readIdempotencyHeader(input.idempotencyHeader ?? null);

        let request: DispatchRunInput = {
            agent,
            subscription,
            channel: HTTP_CHANNEL_NAME,
            payload: body.payload,
            ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
            ...(body.address !== undefined ? { address: body.address } : {}),
            ...(body.attachments !== undefined ? { attachments: body.attachments } : {}),
        };
        // not this.dispatch(): the replacement re-check below has to sit
        // between the payload validation and the engine dispatch
        let envelope = await this.toDispatchEnvelope(request, principal);

        // replaced or removed while the payload was validated: check the
        // replacement and validate against its schema, until the agent stays
        while (this.ctx.agents.get(name) !== request.agent) {
            request = { ...request, ...await this.resolveStart(name, principal) };
            envelope = await this.toDispatchEnvelope(request, principal);
        }

        return this.ctx.engine.dispatch(envelope);
    }

    async dispatch(input: DispatchRunInput, principal: Principal): Promise<StartRunView> {
        return this.ctx.engine.dispatch(await this.toDispatchEnvelope(input, principal));
    }

    async list(query: URLSearchParams, principal: Principal): Promise<RunListView> {
        const request = parseRunListQuery(query, this.ctx.agents.names());
        const { data, total } = await this.findRuns(request, principal);

        return {
            data: data.map((run) => serializeRun(run, this.ctx.agents)),
            meta: {
                total,
                limit: request.limit,
                offset: request.offset,
            },
        };
    }

    async find(filter: RunFindFilter, principal: Principal): Promise<RunFindView> {
        return this.findRuns(toRunListRequest(filter), principal);
    }

    /**
     * The runs of a checked listing request the principal may list (403
     * otherwise): one rapiq query to core's run service, the permission
     * scope (`assertCanListRuns()`) joined to its filters, so `total` and
     * the page stay exact.
     */
    protected async findRuns(request: RunListRequest, principal: Principal): Promise<RunFindView> {
        const agents = await assertCanListRuns(this.ctx, principal, request.agent);
        const filters = agents === undefined ? request.filters : [...request.filters, inArray('agent', [...agents])];
        const { data, meta } = await this.ctx.runService.list(defineQuery({
            ...(filters.length > 0 ? { filters: and(...filters) } : {}),
            sorts: request.sorts,
            pagination: { limit: request.limit, offset: request.offset },
        }));

        return { data, total: meta.total };
    }

    getReadable(id: string, principal: Principal): Promise<Run> {
        return loadReadableRun(this.ctx, principal, id);
    }

    async get(id: string, principal: Principal): Promise<RunDetailView> {
        const run = await this.getReadable(id, principal);

        return { ...serializeRun(run, this.ctx.agents), steps: (await this.ctx.stepService.find(run.id)).map(serializeStep) };
    }

    async artifacts(id: string, principal: Principal): Promise<{ data: Artifact[] }> {
        const run = await this.getReadable(id, principal);

        return { data: await this.ctx.artifactService.find(run.id) };
    }

    async artifact(id: string, artifactId: string, principal: Principal): Promise<RunArtifactView> {
        const run = await this.getReadable(id, principal);

        return loadRunArtifact(this.ctx, run, artifactId);
    }

    async cancel(id: string, principal: Principal): Promise<CancelRunView> {
        await assertGranted(principal, this.ctx.clock, Permission.RUN_CANCEL);

        const target = await this.ctx.runService.findOne(id);

        // a missing run is the engine's 404
        if (target && !await isGranted(principal, Permission.RUN_CANCEL, this.ctx.clock, { agent: target.agent })) {
            throw forbidden(Permission.RUN_CANCEL);
        }

        await this.ctx.engine.cancel(id);

        const run = await this.ctx.engine.getRun(id);

        return { runId: id, status: run?.status };
    }

    async approve(id: string, data: ApproveBody, principal: Principal): Promise<ApproveRunView> {
        // authorize against the run's agent before validating the body
        const run = await loadApprovableRun(this.ctx, principal, id);
        const body = await validateBody(this.approveContainer, data);

        return this.applyAnswer(run.id, body, principal);
    }

    async answer(id: string, answer: ApproveBody, principal: Principal): Promise<ApproveRunView> {
        const run = await loadApprovableRun(this.ctx, principal, id);

        return this.applyAnswer(run.id, answer, principal);
    }

    /** The engine call of an answer whose run the principal may approve (the engine's 404, 409). */
    protected async applyAnswer(runId: string, answer: ApproveBody, principal: Principal): Promise<ApproveRunView> {
        await this.ctx.engine.approve(runId, {
            approvalId: answer.approvalId,
            approved: answer.approved,
            ...(answer.reason !== undefined ? { reason: answer.reason } : {}),
            ...(answer.selected !== undefined ? { selected: answer.selected } : {}),
            approver: toInvoker(principal),
        });

        return { runId, status: 'queued' };
    }

    /**
     * The engine's dispatch envelope for `input`, its payload validated
     * against the subscription's schema.
     */
    protected async toDispatchEnvelope(input: DispatchRunInput, principal: Principal): Promise<DispatchEnvelope> {
        const { agent, subscription } = input;
        const payload = await validatePayload(subscription.options.schema as StandardSchemaV1 | undefined, input.payload);

        return {
            agent: agent.name,
            trigger: subscription.id,
            channel: input.channel,
            payload,
            ...(input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey } : {}),
            ...(input.address !== undefined ? { address: input.address } : {}),
            ...(input.attachments?.length ? { attachments: input.attachments } : {}),
            invoker: toInvoker(principal),
            // the agent the caller checked: one replaced since, or being replaced right now, is refused before any store write (409)
            checked: agent,
        };
    }

    /**
     * The agent registered under `name` now, checked before the 404 (an
     * agent the app does not hold counts as private), and its http
     * subscription.
     */
    protected async resolveStart(name: string, principal: Principal): Promise<{ agent: Agent; subscription: ChannelSubscription }> {
        const current = this.ctx.agents.get(name);

        if (!await isGranted(principal, Permission.AGENT_RUN, this.ctx.clock, agentResource(name, current))) {
            throw forbidden(Permission.AGENT_RUN);
        }

        const agent = current ?? requireAgent(this.ctx.agents, name);

        return { agent, subscription: requireHttpSubscription(agent) };
    }
}
