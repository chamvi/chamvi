/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { EntityQueryInput } from '../../helpers/types.ts';
import type { APIRequestOptions } from '../types.ts';

export type KvEntry = { key: string; value: unknown };

export type DocEntry = { id: string } & Record<string, unknown>;

export interface IStateAPI {
    /** `GET /agents/:name/state/kv`. */
    getKv(agent: string, query?: EntityQueryInput<KvEntry>, options?: APIRequestOptions): Promise<KvEntry[]>;
    /** `GET /agents/:name/state/collections/:collection`. */
    getDocs(agent: string, collection: string, query?: EntityQueryInput<DocEntry>, options?: APIRequestOptions): Promise<DocEntry[]>;
}
