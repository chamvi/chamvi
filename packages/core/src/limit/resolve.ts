/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ToolSet } from 'ai';
import type { IEngine } from '../engine/types.ts';
import { InvalidAgentDefinitionError } from '../errors/index.ts';
import type { RunContext } from '../run/types.ts';
import { hasToolContext } from '../tool/helpers.ts';
import { runSource, runTainted } from '../trust/module.ts';
import { assertToolLimit } from './asserts.ts';
import { LIMIT_APPROVAL_NOTIFICATION } from './constants.ts';
import type { AgentLimits, LimitApprovalTarget, ToolLimit } from './types.ts';

/** The tool's own limit (a chamvi tool's only), replaced whole by the agent's entry; false turns it off. */
function resolveToolLimit(name: string, def: ToolSet[string], agent: AgentLimits | undefined): ToolLimit | undefined {
    const own = hasToolContext(def) ? (def as { limit?: unknown }).limit : undefined;

    // a hand-built chamvi tool can carry an unchecked limit: refused like defineTool() refuses it
    assertToolLimit(own, name);

    // own keys only: a tool named like an Object.prototype member (`constructor`) is no entry
    const entry = agent && Object.hasOwn(agent, name) ? agent[name] : undefined;

    if (entry === undefined) {
        return own;
    }

    return entry === false ? undefined : entry;
}

/**
 * The resolved limit of every limited tool of `tools`, by tool name: at wrap
 * time, and at registration for a static tool set. Throws
 * InvalidAgentDefinitionError for a chamvi tool's malformed own `limit`, a
 * limit on a tool without `execute`, a limit without a limit service
 * (`limited` false), and tools sharing a bucket with a different `max` or
 * `windowMs`.
 */
export function resolveToolLimits(tools: ToolSet, agent: AgentLimits | undefined, service: boolean): Map<string, ToolLimit> {
    const resolved = new Map<string, ToolLimit>();
    const buckets = new Map<string, { tool: string; limit: ToolLimit }>();

    for (const [name, def] of Object.entries(tools)) {
        const limit = resolveToolLimit(name, def, agent);

        if (!limit) {
            continue;
        }

        if (!def.execute) {
            throw new InvalidAgentDefinitionError(`The limit of ${name} needs a tool with execute.`);
        }

        if (!service) {
            throw new InvalidAgentDefinitionError(`The limit of tool "${name}" needs an engine with a limit service.`);
        }

        const bucket = limit.bucket ?? name;
        const seen = buckets.get(bucket);

        if (seen && (seen.limit.max !== limit.max || seen.limit.windowMs !== limit.windowMs)) {
            throw new InvalidAgentDefinitionError(
                `The tools "${seen.tool}" and "${name}" share the limit bucket "${bucket}" with a different max or windowMs.`,
            );
        }

        buckets.set(bucket, { tool: name, limit });
        resolved.set(name, limit);
    }

    return resolved;
}

/**
 * Where a limit approval goes: the run's source channel and address when
 * that channel has `out` (as the outbound gate targets it), else the inbox
 * only. A tainted run's source gets the generic notification in place of
 * the body unless the channel reports the address as direct.
 */
export async function limitApprovalTarget(engine: Pick<IEngine, 'getChannel'>, run: RunContext): Promise<LimitApprovalTarget> {
    const origin = runSource({ run });
    const channel = origin?.address ? engine.getChannel(origin.channel) : undefined;

    if (!origin?.address || !channel?.out) {
        return {};
    }

    const target = { channel: origin.channel, address: origin.address };

    if (!await runTainted({ run }) || await channel.direct?.(origin.address) === true) {
        return target;
    }

    return { ...target, notification: LIMIT_APPROVAL_NOTIFICATION };
}
