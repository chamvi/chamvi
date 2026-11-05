/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ToolSet } from 'ai';
import { createAgentState, createMemoryStore } from '@chamvi/core';
import type { IRunArtifacts, ToolContext } from '@chamvi/core';
import type { ICalendarClient } from '@chamvi/tool-calendar';
import { bindProvided } from '../../../core/src/context/helpers.ts';
import { CALENDAR_CONTEXT } from '../../src/context/constants.ts';

const NO_ARTIFACTS: IRunArtifacts = {
    put: async () => {
        throw new TypeError('artifacts are not used by the calendar tools');
    },
    get: async () => undefined,
    list: async () => [],
};

/** A ToolContext of a run, with `client` provided as the engine would (none without it). */
export function toolContext(client?: ICalendarClient, signal?: AbortSignal): ToolContext {
    const ctx: ToolContext = {
        // the calendar tools reach no channel
        channels: {} as ToolContext['channels'],
        run: {
            runId: 'run-1',
            agent: 'planner',
            trigger: {
                id: 'env-1',
                agent: 'planner',
                trigger: 'http',
                channel: 'http',
                payload: {},
                receivedAt: new Date('2026-11-01T00:00:00Z'),
            },
            signal: signal ?? new AbortController().signal,
        },
        state: createAgentState('planner', undefined, createMemoryStore().state),
        artifacts: NO_ARTIFACTS,
    };

    if (client) {
        bindProvided(ctx, new Map([[CALENDAR_CONTEXT, client]]));
    }

    return ctx;
}

/** Calls `tools[name].execute` as the AI SDK does, with the context. */
export async function callTool<T = unknown>(tools: ToolSet, name: string, input: unknown, ctx: ToolContext): Promise<T> {
    const execute = tools[name]?.execute as ((i: unknown, o: unknown) => Promise<unknown>) | undefined;

    if (!execute) {
        throw new TypeError(`no tool ${name}`);
    }

    return await execute(input, {
        toolCallId: 'call-1',
        messages: [],
        context: ctx,
    }) as T;
}
