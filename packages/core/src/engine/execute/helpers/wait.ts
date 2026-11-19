/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { WaitPoint } from '@chamvi/store';
import type { SuspendRequest } from '../types.ts';

/** Whether `waiting` is the wait point `waitId` (an approval by its approval id). */
export function isSameWaitPoint(waiting: WaitPoint | undefined, waitId: string): boolean {
    if (!waiting) {
        return false;
    }

    return waiting.kind === 'approval' ? waiting.approvalId === waitId : waiting.id === waitId;
}

/** The wait point a suspended call's request stores, expiring `timeoutMs` after `now`. */
export function toWaitPoint(request: SuspendRequest, now: Date): WaitPoint {
    if (request.kind === 'dispatch') {
        return {
            kind: 'dispatch',
            id: request.id,
            toolName: request.toolName,
            toolCallId: request.toolCallId,
            runIds: [...request.runIds],
            expiresAt: new Date(now.getTime() + request.timeoutMs),
        };
    }

    if (request.kind === 'remote') {
        return {
            kind: 'remote',
            id: request.id,
            peer: request.peer,
            agent: request.agent,
            remoteRunId: request.remoteRunId,
            expiresAt: new Date(now.getTime() + request.timeoutMs),
        };
    }

    const { timeoutMs, ...asked } = request;

    return {
        ...asked,
        id: request.approvalId,
        expiresAt: new Date(now.getTime() + timeoutMs),
    };
}
