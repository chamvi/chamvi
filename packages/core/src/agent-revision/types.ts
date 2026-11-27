/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IAgentRevisionRepository } from '@chamvi/store';
import type { AgentRevision } from '@chamvi/core-kit';

export type AgentRevisionServiceContext = {
    repository: IAgentRevisionRepository;
};

/**
 * The operations of `AgentRevisionService`. Anything that satisfies it can stand in
 * for the service: the engine, the channels and the HTTP API take this type.
 */
export interface IAgentRevisionService {
    findOne(agent: string): Promise<AgentRevision | undefined>;

    /** As `findOne`; RepositoryNotFoundError when the agent has no marker. */
    findOneOrFail(agent: string): Promise<AgentRevision>;

    /** Upsert: stores the marker, replacing the hash and `changedAt` of a stored one; resolves the stored marker. */
    save(revision: AgentRevision): Promise<AgentRevision>;

    /** Removes the marker of `agent`; a missing one is a no-op. */
    delete(agent: string): Promise<void>;

    /** Every marker, ordered by agent in code-point order. */
    find(): Promise<AgentRevision[]>;

    /** As `find`; RepositoryNotFoundError when no agent has a marker. */
    findOrFail(): Promise<AgentRevision[]>;
}
