/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource } from 'typeorm';
import { ConversationService } from '@chamvi/core';
import type { IClock } from '@chamvi/core';
import { EntityConflictError } from '@chamvi/store';
import type { Run } from '@chamvi/store';
import { DatabaseConversationRepository } from '../../src/conversation/index.ts';
import { DatabaseRunRepository } from '../../src/run/index.ts';

/** Store a run of this id if absent: a turn references its run, as the engine creates it first. */
export async function seedRun(dataSource: DataSource, id: string, overrides: Partial<Run> = {}): Promise<void> {
    const now = new Date('2026-10-28T00:00:00.000Z');
    const runs = new DatabaseRunRepository(dataSource);

    await runs.save(runs.create({
        id,
        agent: 'helper',
        status: 'running',
        trigger: {
            id,
            agent: 'helper',
            trigger: 'message',
            channel: 'chat',
            payload: {},
            receivedAt: now,
        },
        usage: { inputTokens: 0, outputTokens: 0 },
        createdAt: now,
        updatedAt: now,
        ...overrides,
    })).catch((error: unknown) => {
        if (!(error instanceof EntityConflictError)) {
            throw error;
        }
    });
}

/** The conversation service on the database repositories of the data source. */
export function conversationServiceOf(dataSource: DataSource, clock: IClock): ConversationService {
    return new ConversationService({ repository: new DatabaseConversationRepository(dataSource), clock });
}
