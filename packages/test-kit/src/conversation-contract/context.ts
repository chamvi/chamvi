/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ICheckpointRepository, IConversationRepository, IRunRepository } from '@chamvi/store';
import type { ConversationItemRecord, ConversationRecord } from '@chamvi/core-kit';
import { makeRun, testUuid } from '../fixture/helpers.ts';

/** The repositories of one conversation contract test (set before each) and the inserts over them. */
export class ConversationContractContext {
    conversations!: IConversationRepository;

    runs!: IRunRepository;

    checkpoints!: ICheckpointRepository;

    insert = (value: ConversationRecord) => this.conversations.save(this.conversations.create(value));

    insertRun = async (label: string) => {
        await this.runs.save(this.runs.create(makeRun(testUuid(label))));

        return testUuid(label);
    };

    insertItem = (value: Omit<ConversationItemRecord, 'id'>) => this.conversations.items.save(this.conversations.items.create(value as ConversationItemRecord));
}
