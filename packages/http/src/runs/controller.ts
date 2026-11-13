/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Artifact } from '@chamvi/core';
import {
    DBody,
    DContext,
    DController,
    DGet,
    DHeader,
    DPath,
    DPost,
    DSecurity,
    DTags,
} from '@routup/decorators';
import type { IAppEvent } from 'routup';
import { useHttpContext } from '../app/helpers.ts';
import { usePrincipal } from '../auth/helpers.ts';
import { DProduces, DQuerySchema, DStatus } from '../decorators/index.ts';
import { ForceLoggedInMiddleware, JsonBodyMiddleware, RequiredJsonBodyMiddleware } from '../middleware/index.ts';
import { contentDisposition, toBody } from './helpers.ts';
import { streamRun } from './stream/module.ts';
import type {
    ApproveBody,
    ApproveRunView,
    CancelRunView,
    IRunService,
    RunControllerContext,
    RunDetailView,
    RunListView,
    StartRunRequestBody,
    StartRunView,
} from './types.ts';

@DTags('run')
@DSecurity([], 'bearer')
@DController('')
export class RunController {
    protected service: IRunService;

    constructor(ctx: RunControllerContext) {
        this.service = ctx.service;
    }

    /** Starts a run through the agent's http subscription. */
    @DPost('/agents/:name/runs', [ForceLoggedInMiddleware, JsonBodyMiddleware])
    @DStatus('202')
    async start(
        @DPath('name') name: string,
        @DContext() event: IAppEvent,
        // optional (hence after `event`) so the openapi document marks the body and the header optional;
        // routup passes the parsed body or undefined, and null for an absent header, which the service reads as unset
        @DBody() data?: StartRunRequestBody,
        @DHeader('idempotency-key') idempotencyHeader?: string,
    ): Promise<StartRunView> {
        const result = await this.service.start({
            agent: name,
            data,
            idempotencyHeader,
        }, await usePrincipal(event));

        event.response.status = 202;

        return result;
    }

    /**
     * A page of the runs the caller may read. The filters also read the
     * expression form, `filter=and(eq(agent,'a'),in(status,'queued','running'))`,
     * which cannot be mixed with the bracket form.
     */
    @DGet('/runs', [ForceLoggedInMiddleware])
    @DQuerySchema('runs')
    async list(@DContext() event: IAppEvent): Promise<RunListView> {
        return this.service.list(event.searchParams, await usePrincipal(event));
    }

    /** The run with its steps. */
    @DGet('/runs/:id', [ForceLoggedInMiddleware])
    async get(
        @DPath('id') id: string,
        @DContext() event: IAppEvent,
    ): Promise<RunDetailView> {
        return this.service.get(id, await usePrincipal(event));
    }

    /** The run's events as server-sent events, resumable after a step. */
    @DGet('/runs/:id/stream', [ForceLoggedInMiddleware])
    @DQuerySchema('stream')
    @DProduces('text/event-stream', 'Server-sent events: the run\'s events, until the run settles.')
    async stream(
        @DPath('id') id: string,
        @DContext() event: IAppEvent,
    ): Promise<Response> {
        const run = await this.service.getReadable(id, await usePrincipal(event));

        return streamRun(event, useHttpContext(event), run.id);
    }

    /** The run's artifacts (metadata). */
    @DGet('/runs/:id/artifacts', [ForceLoggedInMiddleware])
    async artifacts(
        @DPath('id') id: string,
        @DContext() event: IAppEvent,
    ): Promise<{ data: Artifact[] }> {
        return this.service.artifacts(id, await usePrincipal(event));
    }

    /** The artifact's bytes as a download. */
    @DGet('/runs/:id/artifacts/:artifactId', [ForceLoggedInMiddleware])
    @DProduces('application/octet-stream', 'The artifact\'s bytes as an attachment download; the actual `content-type` is the artifact\'s stored media type.')
    async artifact(
        @DPath('id') id: string,
        @DPath('artifactId') artifactId: string,
        @DContext() event: IAppEvent,
    ): Promise<Response> {
        const { artifact, data } = await this.service.artifact(id, artifactId, await usePrincipal(event));
        // from the response headers, so CORS and RateLimit-* survive
        const headers = new Headers(event.response.headers);

        headers.set('content-type', artifact.mediaType);
        headers.set('content-length', String(data.byteLength));
        headers.set('content-disposition', contentDisposition(artifact.filename));
        // a stored text/html or image/svg+xml must never render as a page of this origin
        headers.set('x-content-type-options', 'nosniff');
        headers.set('cache-control', 'private, no-store');

        return new Response(toBody(data), { status: 200, headers });
    }

    /** Cancels the run. */
    @DPost('/runs/:id/cancel', [ForceLoggedInMiddleware])
    @DStatus('202')
    async cancel(
        @DPath('id') id: string,
        @DContext() event: IAppEvent,
    ): Promise<CancelRunView> {
        const result = await this.service.cancel(id, await usePrincipal(event));

        event.response.status = 202;

        return result;
    }

    /** Answers the run's approval wait point. */
    @DPost('/runs/:id/approve', [ForceLoggedInMiddleware, RequiredJsonBodyMiddleware])
    @DStatus('202')
    async approve(
        @DPath('id') id: string,
        @DBody() data: ApproveBody,
        @DContext() event: IAppEvent,
    ): Promise<ApproveRunView> {
        const result = await this.service.approve(id, data, await usePrincipal(event));

        event.response.status = 202;

        return result;
    }
}
