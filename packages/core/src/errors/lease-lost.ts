/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError } from './base.ts';
import { ErrorCode } from './constants.ts';

/**
 * A lease was lost. With a run id: reported to onError when this engine stops
 * executing a run because its claim was lost (renewal refused, or another
 * owner took the run over); the run is not failed, its current owner, or
 * recovery after the claim expired, carries it on. With `{ lock }`: a write
 * fenced by the store lock `lock` was refused because its owner no longer
 * holds it unexpired; nothing was written.
 */
export class LeaseLostError extends ChamviError {
    readonly runId?: string;

    readonly lock?: string;

    constructor(target: string | { lock: string }) {
        super({
            message: typeof target === 'string' ?
                `Lost the claim of run "${target}"; it is no longer executed here.` :
                `Lost the lease "${target.lock}"; the write was refused.`,
            code: ErrorCode.LEASE_LOST,
        });

        if (typeof target === 'string') {
            this.runId = target;
        } else {
            this.lock = target.lock;
        }
    }
}
