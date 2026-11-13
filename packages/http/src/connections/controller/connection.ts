/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    DBody,
    DContext,
    DController,
    DDelete,
    DGet,
    DPath,
    DPost,
    DPut,
    DSecurity,
    DTags,
} from '@routup/decorators';
import type { IAppEvent } from 'routup';
import { useHttpContext } from '../../app/helpers.ts';
import { usePrincipal } from '../../auth/helpers.ts';
import { DProduces, DStatus } from '../../decorators/index.ts';
import { ForceLoggedInMiddleware, RequiredJsonBodyMiddleware } from '../../middleware/index.ts';
import { streamConnection } from '../stream/module.ts';
import type {
    ConnectionControllerContext,
    ConnectionDetailView,
    ConnectionSaveBody,
    ConnectionSettingsView,
    ConnectionTestView,
    ConnectionView,
    IConnectionConfigService,
    IConnectionService,
} from '../types.ts';

/** Responses that can carry a pairing QR or stored settings stay out of every cache. */
function noStore(event: IAppEvent): void {
    event.response.headers.set('cache-control', 'private, no-store');
}

@DTags('connection')
@DSecurity([], 'bearer')
@DController('/connections')
export class ConnectionController {
    protected service: IConnectionService;

    protected config: IConnectionConfigService;

    constructor(ctx: ConnectionControllerContext) {
        this.service = ctx.service;
        this.config = ctx.config;
    }

    /** `GET /connections`: the handles, the declared connections and the stored accounts the principal may read. */
    @DGet('', [ForceLoggedInMiddleware])
    async list(@DContext() event: IAppEvent): Promise<{ data: ConnectionView[] }> {
        return this.service.list(await usePrincipal(event));
    }

    /** `GET /connections/:name`: the connection, with its widgets for a writer. */
    @DGet('/:name', [ForceLoggedInMiddleware])
    async get(
        @DPath('name') name: string,
        @DContext() event: IAppEvent,
    ): Promise<ConnectionDetailView> {
        // a writer's response can carry a pairing QR; set first on purpose, so error responses carry it too
        noStore(event);

        return this.service.get(name, await usePrincipal(event));
    }

    /** `GET /connections/:name/events`: the handle's status and widgets as SSE. */
    @DGet('/:name/events', [ForceLoggedInMiddleware])
    @DProduces('text/event-stream', 'Server-sent events: the handle\'s status and widgets.')
    async events(
        @DPath('name') name: string,
        @DContext() event: IAppEvent,
    ): Promise<Response> {
        const handle = await this.service.requireWritable(name, await usePrincipal(event));

        return streamConnection(event, useHttpContext(event), handle);
    }

    /** `POST /connections/:name/reset`: starts the handle's reset (202). */
    @DPost('/:name/reset', [ForceLoggedInMiddleware])
    @DStatus('202')
    async reset(
        @DPath('name') name: string,
        @DContext() event: IAppEvent,
    ): Promise<ConnectionView> {
        const result = await this.service.reset(name, await usePrincipal(event));

        event.response.status = 202;

        return result;
    }

    /** `GET /connections/:name/config`: the stored settings and every field's source. */
    @DGet('/:name/config', [ForceLoggedInMiddleware])
    async read(
        @DPath('name') name: string,
        @DContext() event: IAppEvent,
    ): Promise<ConnectionSettingsView> {
        // set first on purpose, so error responses carry it too
        noStore(event);

        return this.config.read(name, await usePrincipal(event));
    }

    /** `PUT /connections/:name/config`: saves settings and secrets. */
    @DPut('/:name/config', [ForceLoggedInMiddleware, RequiredJsonBodyMiddleware])
    async update(
        @DPath('name') name: string,
        @DBody() data: ConnectionSaveBody,
        @DContext() event: IAppEvent,
    ): Promise<ConnectionSettingsView> {
        // set first on purpose, so error responses carry it too
        noStore(event);

        return this.config.update(name, data, await usePrincipal(event));
    }

    /** `DELETE /connections/:name`: deletes a stored account. */
    @DDelete('/:name', [ForceLoggedInMiddleware])
    async delete(
        @DPath('name') name: string,
        @DContext() event: IAppEvent,
    ): Promise<{ restartRequired: boolean }> {
        return this.config.delete(name, await usePrincipal(event));
    }

    /** `POST /connections/:name/test`: tests the saved values; the body is never read. */
    @DPost('/:name/test', [ForceLoggedInMiddleware])
    async test(
        @DPath('name') name: string,
        @DContext() event: IAppEvent,
    ): Promise<ConnectionTestView> {
        return this.config.test(name, event.request.signal, await usePrincipal(event));
    }
}
