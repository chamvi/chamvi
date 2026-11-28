/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    ConversationItemRecord,
    ConversationNoteRecord,
    ConversationOperationRecord,
    ConversationRecord,
} from '@chamvi/core-kit';
import { testUuid, testUuidV7 } from '../fixture/helpers.ts';
import { KEY } from './constants.ts';

export function conversationOf(label: string, overrides: Partial<ConversationRecord> = {}): ConversationRecord {
    return {
        id: testUuid(label),
        key: KEY,
        identity: {
            agent: 'helper',
            channel: 'chat',
            account: 'main',
            chat: 'room',
            audience: 'direct',
        },
        generation: 0,
        ...overrides,
    };
}

/** The counter of the uuid v7 `itemOf` gives an item without one: unique across a spec file. */
let lastItemId = 0;

/** An item as the service stores it: its uuid v7 `id` set, its `sequence` left to the store. */
export function itemOf(
    scopeId: string,
    runId: string,
    key: string,
    overrides: Partial<Omit<ConversationItemRecord, 'sequence'>> = {},
): Omit<ConversationItemRecord, 'sequence'> {
    lastItemId++;

    return {
        id: testUuidV7(1_000, lastItemId),
        scopeId,
        generation: 0,
        key,
        role: 'user',
        text: `text of ${key}`,
        // stored as given: a repository computes nothing (the service stamps the text's byte length)
        bytes: 1000 + key.length,
        runId,
        createdAt: new Date(1_000),
        status: 'sent',
        ...overrides,
    };
}

export function noteOf(
    label: string,
    scopeId: string,
    runId: string,
    key: string,
    overrides: Partial<ConversationNoteRecord> = {},
): ConversationNoteRecord {
    return {
        id: testUuid(label),
        scopeId,
        generation: 0,
        key,
        text: `note ${key}`,
        createdAt: new Date(1_000),
        updatedAt: new Date(1_000),
        source: {
            runId,
            toolCallId: 'call-1',
            stepIndex: 0,
        },
        ...overrides,
    };
}

export function operationOf(
    label: string,
    scopeId: string,
    runId: string,
    operationId: string,
    overrides: Partial<ConversationOperationRecord> = {},
): ConversationOperationRecord {
    return {
        id: testUuid(label),
        scopeId,
        generation: 0,
        operationId,
        runId,
        inputHash: 'hash',
        kind: 'set',
        key: 'name',
        createdAt: new Date(1_000),
        ...overrides,
    };
}
