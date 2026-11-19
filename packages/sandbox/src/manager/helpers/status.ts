/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { RunStatus } from '@chamvi/store';
import type { IWorkspace } from '../../workspace/types.ts';

/** True for the statuses after which a run never executes again. */
export function isTerminal(status: string): boolean {
    return status === RunStatus.COMPLETED || status === RunStatus.FAILED || status === RunStatus.CANCELLED;
}

export function isExpired(workspace: IWorkspace, now: Date): boolean {
    return workspace.info.expiresAt.getTime() <= now.getTime();
}
