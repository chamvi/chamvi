/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource, EntityManager } from 'typeorm';
import type { IAgentRevisionRepository } from '@chamvi/store';
import type { AgentRevisionRecord } from '@chamvi/core-kit';
import { AgentRevisionEntity } from '../../entities/index.ts';
import { EntityRepositoryAdapter } from '../../entity/module.ts';

/**
 * Agent revision markers in `chamvi_agent_revisions` (`agent`
 * `COLLATE "C"`), stored as given; `upsert` replaces by `agent`.
 */
export class DatabaseAgentRevisionRepository
    extends EntityRepositoryAdapter<AgentRevisionRecord, AgentRevisionEntity>
    implements IAgentRevisionRepository {
    constructor(source: DataSource | EntityManager) {
        super(source.getRepository(AgentRevisionEntity), {
            entity: 'agent_revision',
            alias: 'agentRevision',
            target: AgentRevisionEntity,
            upsertKey: ['agent'],
        });
    }

    withManager(manager: EntityManager): this {
        return new DatabaseAgentRevisionRepository(manager) as this;
    }
}
