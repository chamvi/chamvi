/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    Agent,
    ChannelSubscription,
    IEngine,
    IRunRepository,
    Run,
} from '@chamvi/core';
import { DISPATCH_DEPTH_MAX, InvalidAgentDefinitionError } from '@chamvi/core';
import { isCronChannel } from '../channel/helpers.ts';
import { TERMINAL, UNSETTLED } from './constants.ts';

/**
 * The cron subscription a job fires: `subscriptionId`, or the agent's only
 * subscription of a cron channel the engine holds. Throws
 * InvalidAgentDefinitionError when it is missing or ambiguous.
 */
export function resolveCronSubscription(engine: IEngine, agent: Agent, subscriptionId?: string): ChannelSubscription {
    const crons = (agent.definition.channels ?? []).filter((s) => isCronChannel(engine.getChannel(s.channel)));

    if (subscriptionId !== undefined) {
        const subscription = crons.find((s) => s.id === subscriptionId);

        if (!subscription) {
            throw new InvalidAgentDefinitionError(`Agent "${agent.name}" has no cron subscription "${subscriptionId}".`);
        }

        return subscription;
    }

    if (crons.length !== 1) {
        throw new InvalidAgentDefinitionError(
            `Agent "${agent.name}" has ${crons.length} cron subscriptions; pass the subscription id.`,
        );
    }

    return crons[0] as ChannelSubscription;
}

function isApprovalWait(run: Run): boolean {
    return run.status === 'waiting' && run.waiting?.kind === 'approval';
}

/**
 * The run a job returns on, or `false` to keep waiting: the run itself when it
 * finished or waits for a human (an approval); when it waits on its dispatched
 * runs, the first unsettled descendant that waits on an approval
 * (breadth-first over `parentRunId` children and the runs a dispatch wait
 * point names, a deduplicated run another run dispatched too; each run once,
 * at most `DISPATCH_DEPTH_MAX` levels). A dispatch wait
 * alone keeps the job waiting.
 */
export async function isJobSettled(store: Pick<IRunRepository, 'find' | 'findOne'>, run: Run): Promise<Run | false> {
    if (TERMINAL.includes(run.status) || isApprovalWait(run)) {
        return run;
    }

    if (run.status !== 'waiting' || run.waiting?.kind !== 'dispatch') {
        return false;
    }

    const visited = new Set([run.id]);
    let level = [run];

    for (let depth = 0; depth < DISPATCH_DEPTH_MAX && level.length > 0; depth++) {
        const next: Run[] = [];
        // a level's own children, then the unsettled runs its dispatch waits name (one read)
        const batches: Array<() => Promise<Run[]>> = [
            ...level.map((r) => async () => (await store.find({ parentRunId: r.id, status: UNSETTLED })).data),
            async () => {
                const ids = [...new Set(level.flatMap((r) => (r.waiting?.kind === 'dispatch' ? r.waiting.runIds : []))).difference(visited)];

                return ids.length > 0 ? (await store.find({ ids, status: UNSETTLED })).data : [];
            },
        ];

        for (const batch of batches) {
            for (const found of await batch()) {
                if (visited.has(found.id)) {
                    continue;
                }

                if (isApprovalWait(found)) {
                    return found;
                }

                visited.add(found.id);
                next.push(found);
            }
        }

        level = next;
    }

    return false;
}

/**
 * Whether a queued run is held back by a run of its concurrency key that waits
 * for a human (an approval, its own or a descendant's): it starts only once a
 * human answers (or the approval times out), so a job must not wait for it.
 */
export async function isQueuedBehindApproval(store: Pick<IRunRepository, 'find' | 'findOne'>, run: Run): Promise<boolean> {
    if (run.status !== 'queued' || run.concurrencyKey === undefined) {
        return false;
    }

    // every waiting run of the key: a dispatch wait ahead of an approval wait must not hide it
    const { data } = await store.find({
        agent: run.agent,
        status: ['waiting'],
        concurrencyKey: run.concurrencyKey,
    });

    for (const candidate of data) {
        if (await isJobSettled(store, candidate)) {
            return true;
        }
    }

    return false;
}
