/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { EntityConflictError } from '@chamvi/errors';
import {
    MemoryConversationRepository,
    MemoryRegistry,
    MemoryRunRepository,
} from '@chamvi/store-memory';
import { ConversationService } from '../../../src/conversation/index.ts';
import { describeConversationServiceCases, makeRun } from '../../fixtures/conversation-service.ts';

describeConversationServiceCases({
    name: 'memory',
    async create(clock) {
        const registry = new MemoryRegistry();
        const runs = new MemoryRunRepository({ registry });
        const repository = new MemoryConversationRepository({ registry });

        return {
            service: new ConversationService({ repository, clock }),
            repository,
            // in process: a few turns of the event loop bring the waiter to the row lock the transaction holds
            async untilBlocked() {
                for (let turn = 0; turn < 5; turn++) {
                    await new Promise<void>((resolve) => {
                        setImmediate(resolve);
                    });
                }
            },
            async seedRun(id) {
                await runs.save(runs.create(makeRun(id))).catch((error: unknown) => {
                    if (!(error instanceof EntityConflictError)) {
                        throw error;
                    }
                });
            },
        };
    },
});
