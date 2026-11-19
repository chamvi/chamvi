/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { RemoteApproval } from '@chamvi/store';
import { stableHash } from '../../../effect/helpers.ts';

/** The effect key of a stand-in's start: its record holds the remote run id. */
export function remoteStartKey(runId: string): string {
    return `remote-start:${runId}`;
}

/** The effect key of a stand-in's recorded remote outcome. */
export function remoteWaitKey(runId: string): string {
    return `remote-wait:${runId}`;
}

/** The store lock of a stand-in's poll window. */
export function remotePollKey(runId: string): string {
    return `remote-poll:${runId}`;
}

/**
 * The key of the notification of a remote approval to a stand-in's fixed
 * `approvals` destination: `<runId>:remote:<remote run id>:<approvalId>`, the
 * remote run being the one that waits on the approval (the stand-in's own
 * remote run or one below it), so the channel's `out` dedupes a resend.
 */
export function remoteNotifyKey(runId: string, approval: Pick<RemoteApproval, 'runId' | 'approvalId'>): string {
    return `${runId}:remote:${approval.runId}:${approval.approvalId}`;
}

/**
 * The key of the receiver's notification of an approval to `peer`:
 * `peer-notify:<peer>:<holderRunId>:<hash>`, the hash over the approval's
 * run and approval id. Scoped to the recipient and the local holder, so a
 * downstream peer reporting colliding ids cannot suppress another
 * notification, and bounded in length whatever ids a peer reports.
 */
export function peerNotifyKey(peer: string, holderRunId: string, approval: Pick<RemoteApproval, 'runId' | 'approvalId'>): string {
    return `peer-notify:${peer}:${holderRunId}:${stableHash({ runId: approval.runId, approvalId: approval.approvalId })}`;
}
