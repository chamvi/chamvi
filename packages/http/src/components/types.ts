/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ChannelStatus, IEngine } from '@chamvi/core';
import type { ComponentView } from '@chamvi/core-kit';
import type { Principal } from '../auth/types.ts';
import type { HttpContext } from '../app/types.ts';

/**
 * A background job `GET /components` lists (`HttpAppOptions.components`):
 * its name and a synchronous `status()` in epoch milliseconds, the shape of
 * a hubwire component's status.
 */
export type HttpComponent = {
    readonly name: string;
    status(): ChannelStatus;
};


/** `GET /components`: the jobs in the given order, then the engine's channels with a `status()` in registration order. */
export type ComponentListView = {
    data: ComponentView[];
};

/** What `ComponentService` needs of the http context. */
export type ComponentServiceContext = Pick<HttpContext, 'components' | 'clock' | 'onError'> & {
    engine: Pick<IEngine, 'listChannels'>;
};

export interface IComponentService {
    /** 403 without `chamvi_component_read`; else every job and every channel with a `status()`. */
    list(principal: Principal): Promise<ComponentListView>;
}

export type ComponentControllerContext = {
    service: IComponentService;
};
