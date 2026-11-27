/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ComponentView } from '@chamvi/core-kit';
import type { APIRequestOptions } from '../types.ts';

/** One entry of `GET /components`: a background job or a channel with its last pass times (ISO strings). */
export type ComponentWire = ComponentView;

export interface IComponentAPI {
    getMany(options?: APIRequestOptions): Promise<ComponentWire[]>;
}
