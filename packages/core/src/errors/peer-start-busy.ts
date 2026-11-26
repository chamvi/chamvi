/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError, ErrorCode } from '@chamvi/errors';

/**
 * A peer start refused while another replica holds its `peer-count:` lock:
 * nothing was written, a resend is safe (retryable; http answers 503).
 */
export class PeerStartBusyError extends ChamviError {
    constructor(peer: string, parentRunId: string) {
        super({
            message: `Another start of run ${parentRunId} of peer "${peer}" is being counted; resend it.`,
            code: ErrorCode.PEER_START_BUSY,
        });
    }
}
