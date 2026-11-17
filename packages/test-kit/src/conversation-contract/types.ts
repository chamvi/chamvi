/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ICheckpointRepository, IConversationRepository, IRunRepository } from '@chamvi/store';

/** A fresh conversation repository and the run and checkpoint repositories on the same storage. */
export type ConversationRepositoryContractStore = {
    repository: IConversationRepository;
    /** Runs the children and the active run reference; runs reference a conversation in turn. */
    runs: IRunRepository;
    /** Checkpoints reference a conversation. */
    checkpoints: ICheckpointRepository;
};

export type ConversationRepositoryContractInput = {
    /** Label of the suite, e.g. the driver. */
    name: string;
    /** A fresh, empty conversation, run and checkpoint repository on the same storage per test. */
    create(): Promise<ConversationRepositoryContractStore>;
    /**
     * Resolves once a statement of another caller waits for a row lock a
     * transaction holds: an in-process driver (memory) gives the waiter its
     * turn (two microtask turns); a driver whose statements run elsewhere
     * (PostgreSQL) observes the wait in the database.
     */
    untilBlocked(): Promise<void>;
};
