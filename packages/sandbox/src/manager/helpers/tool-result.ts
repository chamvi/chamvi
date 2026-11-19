/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { RepositoryInstructions } from '../../instructions/types.ts';
import { WORKSPACE_ROOT } from '../../workspace/constants.ts';
import type { IWorkspace } from '../../workspace/types.ts';
import type { WorkspaceToolResult } from '../types.ts';

/** Redact strings after collection too, including metadata and nested instruction context. */
export function redactToolResult<T>(workspace: IWorkspace, result: T): T {
    if (!workspace.redact) {
        return result;
    }

    return JSON.parse(JSON.stringify(result, (_key, value: unknown) => (
        typeof value === 'string' ? workspace.redact!(value) : value
    ))) as T;
}

/**
 * Collects guidance for `create_workspace`: a failure (a missing utility, a
 * stray stderr line, an exec timeout) degrades to `instructions: null` plus
 * the reason, since the workspace is usable without it; a cancelled run
 * still rejects.
 */
export async function collectInstructions(
    collect: () => Promise<RepositoryInstructions>,
    signal: AbortSignal | undefined,
): Promise<{ instructions: RepositoryInstructions | null; instructionsError?: string }> {
    try {
        return { instructions: await collect() };
    } catch (error) {
        if (signal?.aborted) {
            throw error;
        }

        const message = Error.isError(error) ? error.message : String(error);

        return { instructions: null, instructionsError: `Repository guidance could not be read: ${message}` };
    }
}

export function toToolResult(
    workspace: IWorkspace,
    reused: boolean,
    instructions: RepositoryInstructions | null,
    instructionsError?: string,
): WorkspaceToolResult {
    const { info } = workspace;

    return redactToolResult(workspace, {
        workspace: workspace.id,
        root: WORKSPACE_ROOT,
        repo: info.repo ?? null,
        ref: info.ref ?? null,
        commit: info.commit ?? null,
        defaultBranch: info.defaultBranch ?? null,
        image: info.image ?? null,
        expiresAt: info.expiresAt.toISOString(),
        reused,
        instructions,
        ...(instructionsError !== undefined && { instructionsError }),
    });
}
