/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isQuery } from '@rapiq/core';
import { ApiError } from '../../error/module.ts';
import { path } from '../../helpers/path.ts';
import { buildQueryString } from '../../helpers/query.ts';
import { BaseAPI } from '../base.ts';
import type { APIRequestOptions } from '../types.ts';
import type {
    ApproveBody,
    IRunAPI,
    PeerRunViewWire,
    RunDetail,
    RunListFields,
    RunListQuery,
    RunPage,
    RunStreamQuery,
} from './types.ts';

/** The query, sorted newest first when it names no order. */
function withDefaultSort(query: RunListQuery = {}): RunListQuery {
    if (isQuery(query) || query.sorts !== undefined || query.sort !== undefined) {
        return query;
    }

    return { ...query, sorts: '-createdAt' };
}

export class RunAPI extends BaseAPI implements IRunAPI {
    getMany(query?: RunListQuery, options?: APIRequestOptions): Promise<RunPage> {
        return this.request<RunPage>({ url: `/runs${buildQueryString<RunListFields>(withDefaultSort(query))}`, method: 'GET' }, options);
    }

    async getOne(id: string, options?: APIRequestOptions): Promise<RunDetail> {
        return this.request<RunDetail>({ url: path('runs', id), method: 'GET' }, options);
    }

    async getPeerView(id: string, options?: APIRequestOptions): Promise<PeerRunViewWire> {
        return this.request<PeerRunViewWire>({ url: path('runs', id), method: 'GET' }, options);
    }

    async cancel(id: string, options?: APIRequestOptions): Promise<void> {
        await this.request({ url: `${path('runs', id)}/cancel`, method: 'POST' }, options);
    }

    async wake(id: string, options?: APIRequestOptions): Promise<void> {
        await this.request({ url: `${path('runs', id)}/wake`, method: 'POST' }, options);
    }

    async approve(id: string, body: ApproveBody, options?: APIRequestOptions): Promise<void> {
        await this.request({
            url: `${path('runs', id)}/approve`, 
            method: 'POST', 
            body, 
        }, options);
    }

    async stream(id: string, query?: RunStreamQuery, options?: APIRequestOptions): Promise<ReadableStream<Uint8Array>> {
        const response = await this.requestRaw({
            url: `${path('runs', id)}/stream`,
            method: 'GET',
            responseType: 'stream',
            headers: {
                accept: 'text/event-stream',
                ...(query?.lastEventId === undefined ? {} : { 'last-event-id': String(query.lastEventId) }),
            },
        }, options);

        if (!response.data) {
            throw new ApiError(response.status, 'empty_stream', 'The stream has no body.');
        }

        return response.data as ReadableStream<Uint8Array>;
    }
}
