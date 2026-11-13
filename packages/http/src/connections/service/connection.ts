/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IConnectionHandle } from '@chamvi/core';
import { ConflictError, NotFoundError } from '@ebec/http';
import type { Principal } from '../../auth/types.ts';
import {
    assertConnectionAccess,
    canRead,
    canWrite,
    connectionResource,
    listConnections,
    requireHandle,
    serializeConnection,
} from '../helpers/index.ts';
import type {
    ConnectionDetailView,
    ConnectionServiceContext,
    ConnectionView,
    IConnectionService,
} from '../types.ts';

/** The connection handles joined with the declared and stored connections. */
export class ConnectionService implements IConnectionService {
    protected ctx: ConnectionServiceContext;

    constructor(ctx: ConnectionServiceContext) {
        this.ctx = ctx;
    }

    async list(principal: Principal): Promise<{ data: ConnectionView[] }> {
        const views = await listConnections(this.ctx);
        const readable = await Promise.all(views.map((view) => canRead(this.ctx, principal, connectionResource(view.name, view.type))));

        return { data: views.filter((_view, index) => readable[index]) };
    }

    async get(name: string, principal: Principal): Promise<ConnectionView | ConnectionDetailView> {
        // the handle's status joined with what is declared and stored
        const view = (await listConnections(this.ctx)).find((candidate) => candidate.name === name);
        const handle = this.ctx.connections().find((candidate) => candidate.name === name);
        const resource = connectionResource(name, view?.type);

        await assertConnectionAccess(this.ctx, principal, resource);

        if (!view) {
            throw new NotFoundError({ message: `The connection "${name}" does not exist.` });
        }

        if (!await canWrite(this.ctx, principal, resource)) {
            return view;
        }

        return {
            ...view,
            widgets: handle?.widgets() ?? [],
            canReset: handle?.actions.reset !== undefined,
            live: handle !== undefined,
        };
    }

    async requireWritable(name: string, principal: Principal): Promise<IConnectionHandle> {
        return requireHandle(this.ctx, principal, name, true);
    }

    async reset(name: string, principal: Principal): Promise<ConnectionView> {
        const handle = await requireHandle(this.ctx, principal, name, true);
        const { reset } = handle.actions;

        if (!reset) {
            throw new NotFoundError({ message: `The connection "${handle.name}" offers no reset.` });
        }

        // a reset there would wait for another process's lease: refused before it starts
        if (handle.status() === 'held_elsewhere') {
            throw new ConflictError({ message: `The connection "${handle.name}" is held by another process; reset it where it is held, or once it is no longer held elsewhere.` });
        }

        // started, not awaited: a reset can outlast a proxy's timeout, the event stream carries its outcome
        (async () => reset.call(handle.actions))().catch((error: unknown) => {
            this.ctx.onError(error);
        });

        return serializeConnection(handle);
    }
}
