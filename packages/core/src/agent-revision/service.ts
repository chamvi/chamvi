/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { defineQuery } from '@rapiq/core';
import { uuidv7 } from 'uuidv7';
import type { AgentRevision, IAgentRevisionRepository } from '@chamvi/store';
import { RepositoryNotFoundError } from '../errors/index.ts';
import { readAgentRevision } from './helpers.ts';
import type { AgentRevisionServiceContext } from './types.ts';

/**
 * The revision markers of folder agents over an
 * `IAgentRevisionRepository`: one marker per agent, replaced by a later
 * save of the same agent, listed by agent in code-point order. The marker
 * needs no compare: the engine reads and writes it under the lock
 * `agents:<name>`.
 */
export class AgentRevisionService {
    protected repository: IAgentRevisionRepository;

    constructor(ctx: AgentRevisionServiceContext) {
        this.repository = ctx.repository;
    }

    async findOne(agent: string): Promise<AgentRevision | undefined> {
        const record = await this.repository.findOneBy({ agent });

        return record ? readAgentRevision(record) : undefined;
    }

    /** As `findOne`; RepositoryNotFoundError when the agent has no marker. */
    async findOneOrFail(agent: string): Promise<AgentRevision> {
        const revision = await this.findOne(agent);

        if (!revision) {
            throw new RepositoryNotFoundError('agent revisions');
        }

        return revision;
    }

    /** Upsert: stores the marker, replacing the hash and `changedAt` of a stored one; resolves the stored marker. */
    async save(revision: AgentRevision): Promise<AgentRevision> {
        const stored = await this.repository.transaction((repository) => repository.upsert(repository.create({
            id: uuidv7(),
            agent: revision.agent,
            hash: revision.hash,
            changedAt: new Date(revision.changedAt.getTime()),
        })));

        return readAgentRevision(stored);
    }

    /** Removes the marker of `agent`; a missing one is a no-op. */
    async delete(agent: string): Promise<void> {
        await this.repository.transaction(async (repository) => {
            const record = await repository.findOneBy({ agent });

            if (record) {
                await repository.remove(record);
            }
        });
    }

    /** Every marker, ordered by agent in code-point order. */
    async find(): Promise<AgentRevision[]> {
        const { data } = await this.repository.findMany(defineQuery({ sorts: { agent: 'ASC' } }));

        return data.map((record) => readAgentRevision(record));
    }

    /** As `find`; RepositoryNotFoundError when no agent has a marker. */
    async findOrFail(): Promise<AgentRevision[]> {
        const revisions = await this.find();

        if (revisions.length === 0) {
            throw new RepositoryNotFoundError('agent revisions');
        }

        return revisions;
    }
}
