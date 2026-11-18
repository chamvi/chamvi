/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ITransport, TransportRequest } from 'hapic';

/** A transport that never answers; it rejects as fetch does once the request's signal aborts. */
export class SilentTransport implements ITransport {
    readonly signals: AbortSignal[] = [];

    dispatch(input: TransportRequest): Promise<Response> {
        return new Promise<Response>((_resolve, reject) => {
            const { signal } = input;

            if (!signal) {
                return;
            }

            this.signals.push(signal);
            signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        });
    }
}
