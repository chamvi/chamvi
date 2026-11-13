/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Permission } from '@chamvi/access';
import type {
    Agent,
    Artifact,
    ChannelSubscription,
    DispatchEnvelope,
    Run,
} from '@chamvi/core';
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
} from './helpers.ts';
import type {
    ApproveBody,
    ApproveRunView,
    CancelRunView,
    DispatchRunInput,
    IRunService,
    RunArtifactView,
    RunDetailView,
    RunFindFilter,
    RunFindView,
    RunListView,
    RunServiceContext,
    StartRunBody,
    StartRunInput,
    StartRunView,
} from './types.ts';

/** Starts, reads, cancels and answers runs. */
export class RunService implements IRunService {
    protected ctx: RunServiceContext;

    protected startContainer: Container<StartRunBody>;

    protected approveContainer: Container<ApproveBody>;

    constructor(ctx: RunServiceContext) {
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
        const parsed = parseRunListQuery(query, this.ctx.agents.names());
        const { data, total } = await this.find(parsed, principal);

        return {
            data: data.map((run) => serializeRun(run, this.ctx.agents)),
            meta: {
                total,
                limit: parsed.limit,
                offset: parsed.offset,
            },
        };
    }

    async find(filter: RunFindFilter, principal: Principal): Promise<RunFindView> {
        const agents = await assertCanListRuns(this.ctx, principal, filter.agent);
        const {
            parent,
            waiting,
            ...options
        } = filter;
        const { data, total } = await this.ctx.store.runs.find({
            ...options,
            ...(agents !== undefined ? { agents } : {}),
            parentRunId: parent,
            waitKind: waiting,
        });

        return { data, total };
    }

    getReadable(id: string, principal: Principal): Promise<Run> {
        return loadReadableRun(this.ctx, principal, id);
    }

    async get(id: string, principal: Principal): Promise<RunDetailView> {
        const run = await this.getReadable(id, principal);

        return { ...serializeRun(run, this.ctx.agents), steps: (await this.ctx.store.steps.find(run.id)).map(serializeStep) };
    }

    async artifacts(id: string, principal: Principal): Promise<{ data: Artifact[] }> {
        const run = await this.getReadable(id, principal);

        return { data: await this.ctx.store.artifacts.find(run.id) };
    }

    async artifact(id: string, artifactId: string, principal: Principal): Promise<RunArtifactView> {
        const run = await this.getReadable(id, principal);

        return loadRunArtifact(this.ctx, run, artifactId);
    }

    async cancel(id: string, principal: Principal): Promise<CancelRunView> {
        await assertGranted(principal, this.ctx.clock, Permission.RUN_CANCEL);

        const target = await this.ctx.store.runs.findOne(id);

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
        const run = await this.getApprovable(id, principal);
        const body = await validateBody(this.approveContainer, data);

        return this.answer(run, body, principal);
    }

    getApprovable(id: string, principal: Principal): Promise<Run> {
        return loadApprovableRun(this.ctx, principal, id);
    }

    async answer(run: Run, answer: ApproveBody, principal: Principal): Promise<ApproveRunView> {
        await this.ctx.engine.approve(run.id, {
            approvalId: answer.approvalId,
            approved: answer.approved,
            ...(answer.reason !== undefined ? { reason: answer.reason } : {}),
            ...(answer.selected !== undefined ? { selected: answer.selected } : {}),
            approver: toInvoker(principal),
        });

        return { runId: run.id, status: 'queued' };
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
