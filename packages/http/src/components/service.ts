/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Permission } from '@chamvi/access';
import type { ChannelStatus, IClock } from '@chamvi/core';
import { assertGranted } from '../auth/helpers.ts';
import type { Principal } from '../auth/types.ts';
import type {
    ComponentListView,
    ComponentServiceContext,
    ComponentView,
    IComponentService,
} from './types.ts';

const TIMES = ['lastSuccessAt', 'lastErrorAt', 'lastRunAt', 'runningSince'] as const;

/**
 * The background jobs and the channels with a `status()`, for a holder of
 * `chamvi_component_read`. A `status()` that throws lists its entry without
 * times and goes to `onError`.
 */
export class ComponentService implements IComponentService {
    protected ctx: ComponentServiceContext;

    protected clock: IClock;

    constructor(ctx: ComponentServiceContext) {
        this.ctx = ctx;
        this.clock = ctx.clock;
    }

    async list(principal: Principal): Promise<ComponentListView> {
        await assertGranted(principal, this.clock, Permission.COMPONENT_READ);

        const data: ComponentView[] = [];

        for (const component of this.ctx.components()) {
            data.push(this.view(component.name, 'job', () => component.status()));
        }

        for (const channel of this.ctx.engine.listChannels()) {
            const { status } = channel;

            if (typeof status === 'function') {
                data.push(this.view(channel.name, 'channel', () => status.call(channel)));
            }
        }

        return { data };
    }

    protected view(name: string, kind: ComponentView['kind'], read: () => ChannelStatus): ComponentView {
        const view: ComponentView = { name, kind };
        let status: ChannelStatus;

        try {
            status = read();
        } catch (error) {
            this.ctx.onError(error);

            return view;
        }

        for (const key of TIMES) {
            const value = status[key];

            const date = typeof value === 'number' ? new Date(value) : undefined;

            // a time no Date can hold (NaN, out of range) is left out, never a 500
            if (date && !Number.isNaN(date.getTime())) {
                view[key] = date.toISOString();
            }
        }

        return view;
    }
}
