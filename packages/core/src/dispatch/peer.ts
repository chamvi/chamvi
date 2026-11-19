/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Permission, can } from '@chamvi/access';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { isObject } from 'smob';
import type { PeerParent } from '@chamvi/store';
import { AGENT_CHANNEL_NAME } from '../channel/constants.ts';
import type { DispatchResult } from '../channel/types.ts';
import { stableHash } from '../effect/helpers.ts';
import type { DispatchEnvelope } from '../engine/types.ts';
import { AgentNotFoundError, ValidationError } from '../errors/index.ts';
import {
    assertDispatchKey,
    findDispatchRole,
    fromOf,
    maxDepthOf,
    maxPerRunOf,
    readCount,
    validatePayload,
} from './helpers.ts';
import type { PeerDispatchFields, PeerDispatchHost } from './types.ts';

/** The lineage fields a peer sent, checked and copied (a ValidationError for a malformed one). */
function readFields(fields: unknown): PeerDispatchFields {
    if (!isObject(fields) || !isObject(fields.parent)) {
        throw new ValidationError('A peer start needs a role, a stand-in and a parent.');
    }

    const { parent } = fields;

    assertDispatchKey('peer role', fields.role, true);
    assertDispatchKey('peer stand-in', fields.standIn, true);
    assertDispatchKey('peer parent run', parent.runId, true);
    assertDispatchKey('peer parent agent', parent.agent, true);
    assertDispatchKey('peer origin', fields.origin, true);

    if (fields.role === undefined || fields.standIn === undefined || parent.runId === undefined || parent.agent === undefined) {
        throw new ValidationError('A peer start needs a role, a stand-in and a parent.');
    }

    if (typeof parent.depth !== 'number' || !Number.isSafeInteger(parent.depth) || parent.depth < 0) {
        throw new ValidationError('The peer parent depth must be a non-negative integer.');
    }

    if (fields.taint !== undefined && typeof fields.taint !== 'boolean') {
        throw new ValidationError('The peer taint must be a boolean.');
    }

    return {
        role: fields.role,
        standIn: fields.standIn,
        parent: {
            runId: parent.runId, 
            agent: parent.agent, 
            depth: parent.depth, 
        },
        taint: fields.taint === true,
        ...(fields.origin !== undefined ? { origin: fields.origin } : {}),
    };
}

/**
 * Starts a run a peer asked for: the peer name comes only from the
 * invoker (`peers.recognize()`), never from the input. Checked like a local
 * cross-agent dispatch before anything is written (an unrecognized invoker,
 * a role that is missing or does not list `<peer>/<parent.agent>` in
 * `from`, the invoker's `chamvi_agent_run`, `parent.depth + 1` above
 * `maxDepth`, the role schema: ValidationError, no idempotency claim);
 * then `maxPerRun` is counted under
 * `peer-count:<peer>:<parent.runId>:<agent>:<role>` (before the run is
 * created; a resend of a counted call spends no slot) and the run is created
 * on channel `agent` with the peer's invoker, a `PeerParent` lineage and,
 * for a tainted caller, taint `peer:<peer>` from the start. The engine's
 * idempotency claim (scoped to the invoker) dedupes a resend into the same run.
 */
export async function dispatchPeer(
    host: PeerDispatchHost,
    envelope: DispatchEnvelope,
    input: PeerDispatchFields,
): Promise<DispatchResult> {
    const peer = host.peers?.recognize(envelope.invoker);

    if (peer === undefined || envelope.invoker === undefined) {
        throw new ValidationError('The invoker is no configured peer.');
    }

    const fields = readFields(input);
    const { role, parent } = fields;
    const target = envelope.agent;
    const agent = host.getAgent(target);

    if (!agent) {
        throw new AgentNotFoundError(target);
    }

    const subscription = findDispatchRole(agent, role);

    if (!subscription) {
        throw new ValidationError(`Agent "${target}" has no dispatch role "${role}".`);
    }

    const caller = `${peer}/${parent.agent}`;

    // exact: a local agent name in `from` never matches a peer caller
    if (!(fromOf(target, subscription) ?? []).includes(caller)) {
        throw new ValidationError(`Agent "${target}" role "${role}" accepts no dispatches from "${caller}".`);
    }

    // the peer's own grants (decision 11), as http and MCP check a start
    const allowed = await can(envelope.invoker, Permission.AGENT_RUN, {
        attributes: { name: target, private: agent.definition.private === true },
        now: new Date(host.clock.now()),
    });

    if (!allowed) {
        throw new ValidationError(`The peer may not run agent "${target}" (${Permission.AGENT_RUN}).`);
    }

    const depth = parent.depth + 1;
    const maxDepth = maxDepthOf(target, subscription);

    if (depth > maxDepth) {
        throw new ValidationError(`Agent "${target}" role "${role}" accepts dispatches up to depth ${maxDepth}.`);
    }

    const maxPerRun = maxPerRunOf(target, subscription);
    const payload = await validatePayload(target, role, subscription.options.schema as StandardSchemaV1 | undefined, envelope.payload);
    const concurrencyKey = envelope.concurrencyKey ?? subscription.concurrencyKey?.(payload);
    const idempotencyKey = envelope.idempotencyKey ?? subscription.idempotencyKey?.(payload);
    const address = envelope.address ?? subscription.address?.(payload);

    assertDispatchKey('concurrency key', concurrencyKey, true);
    assertDispatchKey('idempotency key', idempotencyKey, true);
    assertDispatchKey('address', address, true);

    const lineage: PeerParent = {
        kind: 'peer',
        peer,
        runId: parent.runId,
        standIn: fields.standIn,
        agent: parent.agent,
        role,
        depth,
        ...(fields.origin !== undefined ? { origin: fields.origin } : {}),
    };
    const callHash = stableHash({
        standIn: fields.standIn,
        role,
        payload,
        idempotencyKey,
        concurrencyKey,
        address,
    });
    const countKey = `peer-count:${peer}:${parent.runId}:${target}:${role}`;
    const create = () => host.createRun({
        agent: target,
        trigger: role,
        channel: AGENT_CHANNEL_NAME,
        payload,
        invoker: envelope.invoker,
        ...(envelope.attachments !== undefined ? { attachments: envelope.attachments } : {}),
        ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
        ...(concurrencyKey !== undefined ? { concurrencyKey } : {}),
        ...(address !== undefined ? { address } : {}),
        // the agent the invoker check saw: a replacement since is refused (AgentReplacedError)
        checked: agent,
    }, lineage, fields.taint ? `peer:${peer}` : undefined);

    // the count is a read-check-write: one at a time per count key in this process
    return host.serial(countKey, async () => {
        const { count, calls } = readCount((await host.effects.findOne(countKey))?.result);

        // a resend of a counted call (its answer lost) redoes the deduplicating start
        if (calls.includes(callHash)) {
            return create();
        }

        if (count >= maxPerRun) {
            throw new ValidationError(
                `Run ${parent.runId} of peer "${peer}" reached its ${maxPerRun} dispatches of agent "${target}" role "${role}" (agent.on({ maxPerRun })).`,
            );
        }

        // counted before the run is created: a crash in between spends the call's slot, a resend reuses it
        await host.effects.save(countKey, { count: count + 1, calls: [...calls, callHash] });

        return create();
    });
}
