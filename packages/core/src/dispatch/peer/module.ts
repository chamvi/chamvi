/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/errors';
import { randomUUID } from 'node:crypto';
import { Permission, can } from '@chamvi/access';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { PeerParent } from '@chamvi/store';
import { AGENT_CHANNEL_NAME } from '../../channel/constants.ts';
import type { DispatchResult } from '../../channel/types.ts';
import { stableHash } from '../../effect/helpers.ts';
import type { DispatchEnvelope } from '../../engine/types.ts';
import { AgentNotFoundError, PeerStartBusyError } from '../../errors/index.ts';
import {
    assertDispatchKey,
    findDispatchRole,
    fromOf,
    maxDepthOf,
    maxPerRunOf,
    readDispatchCount,
    validateDispatchPayload,
} from '../helpers/index.ts';
import type { PeerDispatchFields, PeerDispatchHost } from '../types.ts';
import { peerClaimKey, readPeerFields } from './helpers/index.ts';

/**
 * Starts a run a peer asked for: the peer name comes only from the
 * invoker (`peers.recognize()`), never from the input. Checked like a local
 * cross-agent dispatch before anything is written: an unrecognized invoker
 * or malformed fields (ValidationError); an unknown agent or one the
 * peer's `chamvi_agent_run` does not grant, both AgentNotFoundError, before
 * any role check, so a peer cannot probe the roles of an agent it may not
 * run; then a role that is missing or does not list `<peer>/<parent.agent>`
 * in `from`, `parent.depth + 1` above `maxDepth`, the role schema and a
 * missing idempotency key (ValidationError). Nothing refused claims a key.
 * `maxPerRun` is counted under `peer-count:<peer>:<parent.runId>:<agent>:<role>`
 * under the store lock `peer-count-lock:<same scope>` (held by another replica:
 * PeerStartBusyError, retryable, nothing written), before the run is
 * created; a resend of a counted call spends no slot. The run is created on
 * channel `agent` with the peer's invoker, a `PeerParent` lineage, for a
 * tainted caller or an `untrusted` peer taint `peer:<peer>` from the start,
 * and the claim key
 * `peerClaimKey(key)`, so the same peer key dedupes into the same run while
 * no peer key equals a local dispatch's claim key.
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

    const fields = readPeerFields(input);
    const { role, parent } = fields;
    const target = envelope.agent;
    const agent = host.getAgent(target);

    // the peer's own grants (decision 11); an ungranted agent reads as an unknown one
    const allowed = agent !== undefined && await can(envelope.invoker, Permission.AGENT_RUN, {
        attributes: { name: target, private: agent.definition.private === true },
        now: new Date(host.clock.now()),
    });

    if (!agent || !allowed) {
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

    const depth = parent.depth + 1;
    const maxDepth = maxDepthOf(target, subscription);

    if (depth > maxDepth) {
        throw new ValidationError(`Agent "${target}" role "${role}" accepts dispatches up to depth ${maxDepth}.`);
    }

    const maxPerRun = maxPerRunOf(target, subscription);
    const payload = await validateDispatchPayload(target, role, subscription.options.schema as StandardSchemaV1 | undefined, envelope.payload);
    const given = envelope.idempotencyKey;
    const concurrencyKey = envelope.concurrencyKey ?? subscription.concurrencyKey?.(payload);
    const address = envelope.address ?? subscription.address?.(payload);

    // the caller's lost-answer resend relies on the dedupe, and so does the count's resend skip
    if (given === undefined) {
        throw new ValidationError('A peer start needs an idempotency key.');
    }

    assertDispatchKey('idempotency key', given, true);
    assertDispatchKey('concurrency key', concurrencyKey, true);
    assertDispatchKey('address', address, true);

    const idempotencyKey = peerClaimKey(given);
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
    // the claimed key is the call's identity: a resend whose validated payload differs (a schema adding a fresh value) still reuses its slot
    const callHash = stableHash({ idempotencyKey });
    const countScope = `${peer}:${parent.runId}:${target}:${role}`;
    const countKey = `peer-count:${countScope}`;
    const lockKey = `peer-count-lock:${countScope}`;
    // an untrusted peer taints every run it starts, a trusted one only a tainted caller's
    const tainted = fields.taint || host.peers?.settings(peer).untrusted === true;
    const create = () => host.createRun({
        agent: target,
        trigger: role,
        channel: AGENT_CHANNEL_NAME,
        payload,
        invoker: envelope.invoker,
        idempotencyKey,
        ...(envelope.attachments !== undefined ? { attachments: envelope.attachments } : {}),
        ...(concurrencyKey !== undefined ? { concurrencyKey } : {}),
        ...(address !== undefined ? { address } : {}),
        // the agent the invoker check saw: a replacement since is refused (AgentReplacedError)
        checked: agent,
    }, lineage, tainted ? `peer:${peer}` : undefined);

    // the count is a read-check-write: one at a time per count key in this process, and under a store lock across replicas
    return host.serial(countKey, async () => {
        const owner = randomUUID();

        if (await host.locks.acquire(lockKey, owner, host.lockTtlMs) === undefined) {
            throw new PeerStartBusyError(peer, parent.runId);
        }

        try {
            const { count, calls } = readDispatchCount((await host.effects.findOne(countKey))?.result);

            // a resend of a counted call (its answer lost) redoes the deduplicating start
            if (calls.includes(callHash)) {
                return await create();
            }

            if (count >= maxPerRun) {
                throw new ValidationError(
                    `Run ${parent.runId} of peer "${peer}" reached its ${maxPerRun} dispatches of agent "${target}" role "${role}" (agent.on({ maxPerRun })).`,
                );
            }

            // counted before the run is created: a crash in between spends the call's slot, a resend reuses it
            await host.effects.save(countKey, { count: count + 1, calls: [...calls, callHash] });

            return await create();
        } finally {
            await host.locks.release(lockKey, owner);
        }
    });
}
