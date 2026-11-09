/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Tool } from 'ai';
import { defineTool } from '@chamvi/core';
import type { TriggerEnvelope } from '@chamvi/core';
import { isObject } from 'smob';
import { objectSchema } from './asserts.ts';
import { CRON_CHANNEL } from './constants.ts';
import type { RunInfoResult } from './types.ts';

/** `payload.scheduledAt` of a cron run, when it is a string that parses as an ISO instant. */
function scheduledAtOf(trigger: TriggerEnvelope): string | undefined {
    if (trigger.channel !== CRON_CHANNEL || !isObject(trigger.payload)) {
        return undefined;
    }

    const value = (trigger.payload as Record<string, unknown>).scheduledAt;

    if (typeof value !== 'string') {
        return undefined;
    }

    try {
        Temporal.Instant.from(value);
    } catch {
        return undefined;
    }

    return value;
}

export function runInfoTool(): Tool<Record<string, never>, RunInfoResult> {
    return defineTool<Record<string, never>, RunInfoResult>({
        description: 'Facts about this run: its id, agent, the channel and subscription that started it, when it was ' +
            'received, who started it, the address it came from and, for a scheduled run, when it was scheduled. ' +
            'Call it to know why you were started.',
        inputSchema: objectSchema<Record<string, never>>({}),
        execute: async (_input, { context }) => {
            const { run } = context;
            const { trigger } = run;
            const scheduledAt = scheduledAtOf(trigger);

            return {
                runId: run.runId,
                agent: run.agent,
                channel: trigger.channel,
                subscription: trigger.trigger,
                // a stored run may hold receivedAt serialized
                receivedAt: new Date(trigger.receivedAt).toISOString(),
                ...(trigger.address === undefined ? {} : { address: trigger.address }),
                ...(trigger.invoker ?
                    {
                        invoker: {
                            kind: trigger.invoker.kind,
                            id: trigger.invoker.id,
                            ...(trigger.invoker.name === undefined ? {} : { name: trigger.invoker.name }),
                        },
                    } :
                    {}),
                ...(trigger.parent ?
                    {
                        parent: {
                            agent: trigger.parent.agent, 
                            role: trigger.parent.role, 
                            depth: trigger.parent.depth, 
                        }, 
                    } :
                    {}),
                ...(scheduledAt === undefined ? {} : { scheduledAt }),
            };
        },
    });
}
