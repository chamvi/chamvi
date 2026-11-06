/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ToolSet } from 'ai';
import type { ToolContext } from '@chamvi/core';
import { createAgentState, createMemoryStore, systemClock } from '@chamvi/core';
import { createRunArtifacts } from '../../../core/src/artifact/module.ts';
import type { ListArtifactsResult, ProcessFilesResult } from '@chamvi/tool-files';

export function toolContext(runId: string, signal: AbortSignal = new AbortController().signal, store = createMemoryStore()): ToolContext {
    return {
        channels: {} as ToolContext['channels'],
        run: {
            runId,
            agent: 'files',
            trigger: {
                id: `env-${runId}`,
                agent: 'files',
                trigger: 'test',
                channel: 'test',
                payload: {},
                receivedAt: new Date(0),
            },
            signal,
        },
        state: createAgentState('files', undefined, store.state),
        artifacts: createRunArtifacts(store.artifacts, { id: runId, agent: 'files' }, systemClock),
    };
}

export async function callTool(tools: ToolSet, input: unknown, context: ToolContext, toolCallId = 'call-1', abortSignal?: AbortSignal): Promise<ProcessFilesResult> {
    const execute = tools.process_files!.execute as (i: unknown, o: unknown) => Promise<ProcessFilesResult>;

    return execute(input, {
        toolCallId,
        messages: [],
        context,
        abortSignal,
    });
}

export async function listTool(tools: ToolSet, input: unknown, context: ToolContext, abortSignal?: AbortSignal): Promise<ListArtifactsResult> {
    const execute = tools.list_artifacts!.execute as (i: unknown, o: unknown) => Promise<ListArtifactsResult>;

    return execute(input, {
        toolCallId: 'list-1',
        messages: [],
        context,
        abortSignal,
    });
}
