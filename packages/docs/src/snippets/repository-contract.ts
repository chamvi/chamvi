// #region contract
// test/unit/conversation.spec.ts
import {
    MemoryCheckpointRepository,
    MemoryConversationRepository,
    MemoryRegistry,
    MemoryRunRepository,
} from '@chamvi/store-memory';
import { describeConversationRepositoryContract } from '@chamvi/test-kit';

describeConversationRepositoryContract({
    name: 'memory',
    async create() {
        // the runs and checkpoints a conversation is referenced by, on the same storage
        const registry = new MemoryRegistry();

        return {
            repository: new MemoryConversationRepository({ registry }),
            runs: new MemoryRunRepository({ registry }),
            checkpoints: new MemoryCheckpointRepository({ registry }),
        };
    },
    // resolves once another caller waits for a row lock a transaction holds
    async untilBlocked() {
        await Promise.resolve();
        await Promise.resolve();
    },
});
// #endregion contract
