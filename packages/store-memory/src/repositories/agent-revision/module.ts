/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { AgentRevisionRecord, IAgentRevisionRepository } from '@chamvi/store';
import { MemoryEntityRepository } from '../../entity/module.ts';
import type { MemoryRepositoryOptions } from '../../entity/types.ts';

/**
 * Agent revision markers in the registry (entity `agent_revision`, key
 * `id`, `agent` unique), stored as given; `upsert` replaces by `agent`.
 */
export class MemoryAgentRevisionRepository extends MemoryEntityRepository<AgentRevisionRecord> implements IAgentRevisionRepository {
    constructor(options: MemoryRepositoryOptions) {
        super({
            entity: 'agent_revision',
            registry: options.registry,
            key: ['id'],
            unique: [['agent']],
            upsertKey: ['agent'],
        });
    }
}
