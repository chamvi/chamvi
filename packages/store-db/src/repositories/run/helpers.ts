/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DeepPartial } from 'typeorm';
import type {
    Artifact,
    Run,
    TriggerEnvelope,
    WaitPoint,
} from '@chamvi/store';
import type { RunEntity } from '../../entities/index.ts';

/**
 * The columns of a (partial) run: an absent property maps to absent
 * columns, so a where or a changed-column diff only names what is set.
 */
export function toRunEntity(value: Partial<Run>): DeepPartial<RunEntity> {
    const { claim, conversation } = value;

    return {
        id: value.id,
        agent: value.agent,
        status: value.status,
        trigger: value.trigger as Record<string, unknown> | undefined,
        concurrencyKey: value.concurrencyKey,
        address: value.address,
        output: value.output,
        error: value.error,
        usage: value.usage,
        subtreeUsage: value.subtreeUsage,
        parentRunId: value.parentRunId,
        waiting: value.waiting as Record<string, unknown> | undefined,
        taint: value.taint,
        claimOwner: claim?.owner,
        claimExpiresAt: claim?.expiresAt,
        agentRevision: value.agentRevision,
        cancelRequested: value.cancelRequested,
        conversationScopeId: conversation?.scope.id,
        conversationGeneration: conversation?.scope.generation,
        conversationAgent: conversation?.scope.identity.agent,
        conversationChannel: conversation?.scope.identity.channel,
        conversationAccount: conversation?.scope.identity.account,
        conversationChat: conversation?.scope.identity.chat,
        conversationAudience: conversation?.scope.identity.audience,
        conversationText: conversation?.text,
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
        startedAt: value.startedAt,
        finishedAt: value.finishedAt,
    } as DeepPartial<RunEntity>;
}

/** A stored envelope with the dates jsonb keeps as strings revived; otherwise as stored. */
function reviveTrigger(trigger: Record<string, unknown>): TriggerEnvelope {
    const output: Record<string, unknown> = { ...trigger, receivedAt: new Date(trigger.receivedAt as string) };

    if (Array.isArray(trigger.attachments)) {
        output.attachments = (trigger.attachments as Record<string, unknown>[]).map((attachment) => ({
            ...attachment,
            createdAt: new Date(attachment.createdAt as string),
        }) as Artifact);
    }

    return output as TriggerEnvelope;
}

/** A stored wait point with the dates jsonb keeps as strings revived; otherwise as stored. */
function reviveWaiting(waiting: Record<string, unknown>): WaitPoint {
    const output: Record<string, unknown> = { ...waiting, expiresAt: new Date(waiting.expiresAt as string) };

    if (typeof waiting.notifiedAt === 'string') {
        output.notifiedAt = new Date(waiting.notifiedAt);
    }

    return output as WaitPoint;
}

/** The run of a row: a NULL column is an absent property. */
export function fromRunEntity(entity: RunEntity): Run {
    const run: Run = {
        id: entity.id,
        agent: entity.agent,
        status: entity.status,
        trigger: reviveTrigger(entity.trigger),
        usage: entity.usage,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
    };

    if (entity.conversationScopeId !== null) {
        run.conversation = {
            scope: {
                id: entity.conversationScopeId,
                generation: entity.conversationGeneration!,
                identity: {
                    agent: entity.conversationAgent!,
                    channel: entity.conversationChannel!,
                    account: entity.conversationAccount!,
                    chat: entity.conversationChat!,
                    audience: entity.conversationAudience!,
                },
            },
            text: entity.conversationText!,
        };
    }

    const optional: [keyof Run, unknown][] = [
        ['concurrencyKey', entity.concurrencyKey],
        ['address', entity.address],
        ['output', entity.output],
        ['error', entity.error],
        ['subtreeUsage', entity.subtreeUsage],
        ['parentRunId', entity.parentRunId],
        ['agentRevision', entity.agentRevision],
        ['cancelRequested', entity.cancelRequested],
        ['startedAt', entity.startedAt],
        ['finishedAt', entity.finishedAt],
    ];

    for (const [key, value] of optional) {
        if (value !== null && value !== undefined) {
            (run as Record<string, unknown>)[key] = value;
        }
    }

    if (entity.waiting !== null) {
        run.waiting = reviveWaiting(entity.waiting);
    }

    if (entity.taint !== null) {
        run.taint = { ...entity.taint, at: new Date(entity.taint.at) };
    }

    if (entity.claimOwner !== null) {
        run.claim = { owner: entity.claimOwner, expiresAt: entity.claimExpiresAt as Date };
    }

    return run;
}
