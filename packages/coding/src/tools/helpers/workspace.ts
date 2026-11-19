/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ToolContext } from '@chamvi/core';
import type { IWorkspace } from '@chamvi/sandbox';
import type { CodingWorkspaces } from '../types.ts';
import { optionalString } from './input.ts';

/** The calling run's workspace named by `input.workspace`, or its only one (found again after a restart). */
export async function workspaceOf(
    workspaces: CodingWorkspaces,
    body: Record<string, unknown>,
    context: ToolContext,
): Promise<IWorkspace> {
    const id = optionalString(body.workspace, 'workspace');

    return workspaces.get(context.run.runId, id);
}

/**
 * The unredacted text of a file, for a tool that writes it back
 * (`IWorkspace.readFileRaw` when the workspace redacts, else `readFile`);
 * never for text shown to the model.
 */
export function readRawText(workspace: IWorkspace, path: string): Promise<string> {
    return workspace.readFileRaw ? workspace.readFileRaw(path) : workspace.readFile(path);
}

/** `text` through the workspace's credential redaction (`IWorkspace.redact`), when it has one. */
export function redactText(workspace: IWorkspace, text: string): string {
    return workspace.redact ? workspace.redact(text) : text;
}
