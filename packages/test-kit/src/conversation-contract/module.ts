/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { beforeEach, describe } from 'vitest';
import { registerConversationChildCases } from './children.ts';
import { ConversationContractContext } from './context.ts';
import { registerConversationCopyCases } from './copies.ts';
import { registerConversationRowCases } from './rows.ts';
import { registerConversationTransactionCases } from './transactions.ts';
import type { ConversationRepositoryContractInput } from './types.ts';

/**
 * The storage behaviour of an `IConversationRepository`: conversations
 * stored as given (`key` unique, `activeRunId` referencing a run), their
 * items, notes and operations as child repositories (unique natural
 * keys, references to the conversation and to a run, item storage keys
 * in the order items are stored), the children bound to the root's
 * transaction and rolled back with it, runs and checkpoints referencing a
 * conversation, a conversation row lock that holds off another
 * transaction's locked read but not the inserts of rows referencing it,
 * copies, and concurrent first saves.
 */
export function describeConversationRepositoryContract(input: ConversationRepositoryContractInput): void {
    describe(`conversation repository contract: ${input.name}`, () => {
        const context = new ConversationContractContext();

        beforeEach(async () => {
            ({
                repository: context.conversations,
                runs: context.runs,
                checkpoints: context.checkpoints,
            } = await input.create());
        });

        registerConversationRowCases(context);
        registerConversationChildCases(context);
        registerConversationTransactionCases(context, input);
        registerConversationCopyCases(context);
    });
}
