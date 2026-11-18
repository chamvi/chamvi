/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { path } from '../../helpers/path.ts';
import { BaseAPI } from '../base.ts';
import { dataOf } from '../helpers.ts';
import type { APIRequestOptions } from '../types.ts';
import type { ArtifactWire, IArtifactAPI } from './types.ts';

export class ArtifactAPI extends BaseAPI implements IArtifactAPI {
    async getMany(runId: string, options?: APIRequestOptions): Promise<ArtifactWire[]> {
        return dataOf<ArtifactWire>(await this.request({ url: `${path('runs', runId)}/artifacts`, method: 'GET' }, options));
    }

    async read(runId: string, artifactId: string, options?: APIRequestOptions): Promise<Blob> {
        // a stream, read after the answer: the deadline bounds the answer, never the download
        const response = await this.requestRaw({
            url: `${path('runs', runId)}/artifacts${path(artifactId)}`,
            method: 'GET',
            responseType: 'stream',
            headers: { accept: '*/*' },
        }, options);
        const type = response.headers.get('content-type');

        return new Response(response.data as ReadableStream<Uint8Array> | null, type ? { headers: { 'content-type': type } } : {}).blob();
    }
}
