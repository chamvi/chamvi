/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Permission } from '@chamvi/access';
import type { ChannelStatus, IClock } from '@chamvi/core';
import { isObject } from 'smob';
import { assertGranted, isGranted } from '../auth/helpers/index.ts';
import type { Principal } from '../auth/types.ts';
import type { ComponentListView, ComponentServiceContext, IComponentService } from './types.ts';
import type { ComponentView } from '@chamvi/core-kit';

const TIMES = ['lastSuccessAt', 'lastErrorAt', 'lastRunAt', 'runningSince'] as const;

/**
 * The background jobs and the channels with a `status()`, for a holder of
 * `chamvi_component_read`, each row checked against `{ name, kind }`. A `status()` that throws lists its entry without
 * times and goes to `onError`; one that returns no object lists it without
 * times.
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

        const entries: {
            name: string; 
            kind: ComponentView['kind']; 
            read: () => ChannelStatus 
        }[] = [];

        for (const component of this.ctx.components()) {
            entries.push({
                name: component.name, 
                kind: 'job', 
                read: () => component.status(), 
            });
        }

        for (const channel of this.ctx.engine.listChannels()) {
            const { status } = channel;

            if (typeof status === 'function') {
                entries.push({
                    name: channel.name, 
                    kind: 'channel', 
                    read: () => status.call(channel), 
                });
            }
        }

        // the gate above passes a grant restricted to some components; each row needs its own,
        // checked before its status() is read
        const granted = await Promise.all(entries.map((entry) => isGranted(
            principal,
            Permission.COMPONENT_READ,
            this.clock,
            { name: entry.name, kind: entry.kind },
        )));

        return {
            data: entries
                .filter((_entry, index) => granted[index])
                .map((entry) => this.view(entry.name, entry.kind, entry.read)),
        };
    }

    protected view(name: string, kind: ComponentView['kind'], read: () => ChannelStatus): ComponentView {
        const view: ComponentView = { name, kind };
        let status: ChannelStatus;

        try {
            status = read();

            // a third-party status() that returns no object (undefined, null) has no times to list
            if (!isObject(status)) {
                return view;
            }
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
