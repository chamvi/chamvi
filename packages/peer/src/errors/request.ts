/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError } from '@chamvi/core';
import { PEER_REQUEST_ERROR_CODE } from './constants.ts';

/**
 * A request to a peer that failed for now (a 5xx, a 429, a 409 conflict, a
 * network error): the engine retries it. `retryAfterMs` is the
 * wait the peer asked for (`Retry-After`), absent when it named none. A
 * permanent refusal is core's ValidationError instead.
 */
export class PeerRequestError extends ChamviError {
    readonly retryAfterMs: number | undefined;

    constructor(message: string, retryAfterMs?: number) {
        super({ message, code: PEER_REQUEST_ERROR_CODE });
        this.retryAfterMs = retryAfterMs;
    }
}
