/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Run } from '@chamvi/store';
import type { PeerRunView } from '../../../../peer/types.ts';

export interface IEngineRemoteApprovals {
    /**
     * Stores what the view of a remote run that has not settled shows on
     * stand-in `run`'s wait point (its status, the pending remote approval)
     * and announces a new approval to the remote agent's `approvals` destination.
     */
    surface(run: Run, view: PeerRunView): Promise<void>;
    /** Sends the notification of the remote approval stand-in `runId` holds, unless it went out already. */
    deliver(runId: string, signal: AbortSignal): Promise<void>;
    /** Whether stand-in `run`'s remote agent has a fixed `approvals` destination. */
    hasDestination(run: Run): boolean;
}
