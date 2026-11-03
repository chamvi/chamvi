/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ToolDeniedError, approve } from '@chamvi/core';
import type {
    AgentHooks,
    ApprovalWaitPoint,
    IEngine,
    Run,
} from '@chamvi/core';

export type IssuedApproval = {
    runId: string;
    approvalId: string;
    toolName: string;
    title: string;
    expiresAt: Date;
};

/** The run's approval wait point; undefined without one or for another kind. */
export function approvalWait(run: Pick<Run, 'waiting'> | undefined): ApprovalWaitPoint | undefined {
    return run?.waiting?.kind === 'approval' ? run.waiting : undefined;
}

/**
 * Records each new wait point the engine emits (what the owner would be
 * asked), in order: `calls[i].approvalId`.
 */
export function recordApprovals(engine: IEngine): { calls: IssuedApproval[] } {
    const calls: IssuedApproval[] = [];
    const seen = new Set<string>();

    engine.on('run.updated', (event) => {
        if (event.type !== 'run.updated') {
            return;
        }

        const { run } = event;
        const waiting = approvalWait(run);
        const key = waiting ? `${run.id}:${waiting.approvalId}` : '';

        if (run.status !== 'waiting' || !waiting || seen.has(key)) {
            return;
        }

        seen.add(key);
        calls.push({
            runId: run.id,
            approvalId: waiting.approvalId,
            toolName: waiting.toolName,
            title: waiting.title,
            expiresAt: waiting.expiresAt,
        });
    });

    return { calls };
}

/**
 * Agent hooks that ask for an approval before every call of `toolName` and
 * refuse a denied one with ToolDeniedError.
 */
export function gateTool(toolName: string): AgentHooks {
    return {
        async beforeToolExecution(info, ctx) {
            if (info.toolName !== toolName) {
                return info.input;
            }

            const decision = await approve(ctx, { title: `Run ${toolName}?` });

            if (!decision.approved) {
                throw new ToolDeniedError(`${toolName} denied: ${decision.reason ?? 'no reason'}`);
            }

            return info.input;
        },
    };
}
