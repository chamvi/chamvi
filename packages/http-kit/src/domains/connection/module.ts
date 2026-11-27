/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ApiError } from '../../error/module.ts';
import { path } from '../../helpers/path.ts';
import { BaseAPI } from '../base.ts';
import { dataOf } from '../helpers.ts';
import type { APIRequestOptions } from '../types.ts';
import type { ConnectionCreateBody, ConnectionSaveBody } from '@chamvi/core-kit';
import type {
    ConnectionDetailWire,
    ConnectionSettingsWire,
    ConnectionTestWire,
    ConnectionWire,
    IConnectionAPI,
} from './types.ts';

export class ConnectionAPI extends BaseAPI implements IConnectionAPI {
    async getMany(options?: APIRequestOptions): Promise<ConnectionWire[]> {
        return dataOf<ConnectionWire>(await this.request({ url: '/connections', method: 'GET' }, options));
    }

    getOne(name: string, options?: APIRequestOptions): Promise<ConnectionDetailWire> {
        return this.request<ConnectionDetailWire>({ url: path('connections', name), method: 'GET' }, options);
    }

    reset(name: string, options?: APIRequestOptions): Promise<ConnectionWire> {
        return this.request<ConnectionWire>({ url: `${path('connections', name)}/reset`, method: 'POST' }, options);
    }

    async stream(name: string, signal: AbortSignal): Promise<ReadableStream<Uint8Array>> {
        const response = await this.requestRaw({
            url: `${path('connections', name)}/events`,
            method: 'GET',
            responseType: 'stream',
            headers: { accept: 'text/event-stream' },
        }, { signal });

        if (!response.data) {
            throw new ApiError(response.status, 'empty_stream', 'The stream has no body.');
        }

        return response.data as ReadableStream<Uint8Array>;
    }

    getConfig(name: string, options?: APIRequestOptions): Promise<ConnectionSettingsWire> {
        return this.request<ConnectionSettingsWire>({ url: `${path('connections', name)}/config`, method: 'GET' }, options);
    }

    create(type: string, body: ConnectionCreateBody, options?: APIRequestOptions): Promise<ConnectionSettingsWire & { name: string }> {
        return this.request({
            url: `${path('connection-types', type)}/connections`,
            method: 'POST',
            body,
        }, options);
    }

    save(name: string, body: ConnectionSaveBody, options?: APIRequestOptions): Promise<ConnectionSettingsWire> {
        return this.request({
            url: `${path('connections', name)}/config`,
            method: 'PUT',
            body,
        }, options);
    }

    delete(name: string, options?: APIRequestOptions): Promise<{ restartRequired: boolean }> {
        return this.request({ url: path('connections', name), method: 'DELETE' }, options);
    }

    test(name: string, options?: APIRequestOptions): Promise<ConnectionTestWire> {
        return this.request<ConnectionTestWire>({ url: `${path('connections', name)}/test`, method: 'POST' }, options);
    }
}
