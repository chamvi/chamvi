/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DeepPartial } from 'typeorm';
import type {
    ConversationItemRecord,
    ConversationNoteRecord,
    ConversationOperationRecord,
    ConversationRecord,
} from '@chamvi/store';
import type {
    ConversationEntity,
    ConversationItemEntity,
    ConversationNoteEntity,
    ConversationOperationEntity,
} from '../../entities/index.ts';

/** NULL, or a column a query left out, is an absent value. */
const isAbsent = (value: unknown) => value === null || value === undefined;

/**
 * The columns of a (partial) conversation: an absent property maps to
 * absent columns, a conversation without a snapshot to absent snapshot
 * columns (written as NULL by an update).
 */
export function toConversationEntity(value: Partial<ConversationRecord>): DeepPartial<ConversationEntity> {
    const { identity, snapshot } = value;

    return {
        id: value.id,
        key: value.key,
        agent: identity?.agent,
        channel: identity?.channel,
        account: identity?.account,
        chat: identity?.chat,
        audience: identity?.audience,
        generation: value.generation,
        activeRunId: value.activeRunId,
        snapshotMessages: snapshot?.messages,
        snapshotItemIds: snapshot?.itemIds,
        snapshotNoteKeys: snapshot?.noteKeys,
        snapshotCreatedAt: snapshot?.createdAt,
        snapshotOmitted: snapshot?.omitted,
    } as DeepPartial<ConversationEntity>;
}

/** The conversation of a row: a NULL column is an absent property. */
export function fromConversationEntity(entity: ConversationEntity): ConversationRecord {
    const record: ConversationRecord = {
        id: entity.id,
        key: entity.key,
        identity: {
            agent: entity.agent,
            channel: entity.channel,
            account: entity.account,
            chat: entity.chat,
            audience: entity.audience,
        },
        generation: entity.generation,
    };

    if (!isAbsent(entity.activeRunId)) {
        record.activeRunId = entity.activeRunId!;
    }

    if (!isAbsent(entity.snapshotCreatedAt)) {
        record.snapshot = {
            messages: entity.snapshotMessages ?? [],
            itemIds: entity.snapshotItemIds ?? [],
            noteKeys: entity.snapshotNoteKeys ?? [],
            createdAt: entity.snapshotCreatedAt!,
            omitted: entity.snapshotOmitted ?? 0,
        };
    }

    return record;
}

/** The columns of a (partial) item; the storage key is a bigint, read back as a string and returned as a number. */
export function toConversationItemEntity(value: Partial<ConversationItemRecord>): DeepPartial<ConversationItemEntity> {
    const { target } = value;

    return {
        id: value.id,
        scopeId: value.scopeId,
        generation: value.generation,
        key: value.key,
        runId: value.runId,
        createdAt: value.createdAt,
        role: value.role,
        text: value.text,
        bytes: value.bytes,
        status: value.status,
        effectKey: value.effectKey,
        targetChannel: target?.channel,
        targetAddress: target?.address,
    } as DeepPartial<ConversationItemEntity>;
}

/** The item of a row: a NULL (or unselected) column is an absent property, the storage key a number. */
export function fromConversationItemEntity(entity: ConversationItemEntity): ConversationItemRecord {
    const record = {
        id: Number(entity.id),
        scopeId: entity.scopeId,
        generation: entity.generation,
        key: entity.key,
        runId: entity.runId,
        createdAt: entity.createdAt,
        role: entity.role,
        text: entity.text,
        bytes: entity.bytes,
        status: entity.status,
    } as ConversationItemRecord;

    if (!isAbsent(entity.effectKey)) {
        record.effectKey = entity.effectKey!;
    }

    if (!isAbsent(entity.targetChannel)) {
        record.target = { channel: entity.targetChannel!, address: entity.targetAddress ?? '' };
    }

    return dropAbsent(record);
}

export function toConversationNoteEntity(value: Partial<ConversationNoteRecord>): DeepPartial<ConversationNoteEntity> {
    const { source } = value;

    return {
        id: value.id,
        scopeId: value.scopeId,
        generation: value.generation,
        key: value.key,
        text: value.text,
        runId: source?.runId,
        toolCallId: source?.toolCallId,
        stepIndex: source?.stepIndex,
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
        expiresAt: value.expiresAt,
    } as DeepPartial<ConversationNoteEntity>;
}

export function fromConversationNoteEntity(entity: ConversationNoteEntity): ConversationNoteRecord {
    const record: ConversationNoteRecord = {
        id: entity.id,
        scopeId: entity.scopeId,
        generation: entity.generation,
        key: entity.key,
        text: entity.text,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
        source: {
            runId: entity.runId,
            toolCallId: entity.toolCallId,
            stepIndex: entity.stepIndex,
        },
    };

    if (!isAbsent(entity.expiresAt)) {
        record.expiresAt = entity.expiresAt!;
    }

    return record;
}

export function toConversationOperationEntity(value: Partial<ConversationOperationRecord>): DeepPartial<ConversationOperationEntity> {
    return {
        id: value.id,
        scopeId: value.scopeId,
        generation: value.generation,
        operationId: value.operationId,
        runId: value.runId,
        inputHash: value.inputHash,
        kind: value.kind,
        key: value.key,
        removed: value.removed,
        createdAt: value.createdAt,
    } as DeepPartial<ConversationOperationEntity>;
}

export function fromConversationOperationEntity(entity: ConversationOperationEntity): ConversationOperationRecord {
    const record: ConversationOperationRecord = {
        id: entity.id,
        scopeId: entity.scopeId,
        generation: entity.generation,
        operationId: entity.operationId,
        runId: entity.runId,
        inputHash: entity.inputHash,
        kind: entity.kind,
        key: entity.key,
        createdAt: entity.createdAt,
    };

    if (!isAbsent(entity.removed)) {
        record.removed = entity.removed!;
    }

    return record;
}

/** The record without the properties a partial row (a `fields` selection) left undefined. */
function dropAbsent<T extends object>(record: T): T {
    for (const [name, value] of Object.entries(record)) {
        if (value === undefined || (typeof value === 'number' && Number.isNaN(value))) {
            delete (record as Record<string, unknown>)[name];
        }
    }

    return record;
}
