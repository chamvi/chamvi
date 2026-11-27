/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ICheckpointRepository } from '@chamvi/store';
import type { CheckpointRecord } from '@chamvi/core-kit';
import { MemoryEntityRepository } from '../../entity/module.ts';
import type { MemoryRepositoryOptions } from '../../entity/types.ts';

/**
 * Checkpoints in the registry (entity `checkpoint`, key `id`, `runId`
 * unique and referencing a run, `conversation.scopeId` a conversation),
 * stored as given.
 */
export class MemoryCheckpointRepository extends MemoryEntityRepository<CheckpointRecord> implements ICheckpointRepository {
    constructor(options: MemoryRepositoryOptions) {
        super({
            entity: 'checkpoint',
            registry: options.registry,
            key: ['id'],
            unique: [['runId']],
            references: [
                { field: 'runId', entity: 'run' },
                { field: 'conversation.scopeId', entity: 'conversation' },
            ],
        });
    }
}
