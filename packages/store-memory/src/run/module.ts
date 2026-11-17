/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IQuery } from '@rapiq/core';
import { isObject } from 'smob';
import type {
    EntityFindManyResult,
    IRunRepository,
    Run,
    WaitPoint,
} from '@chamvi/store';
import { MemoryEntityRepository } from '../entity/module.ts';
import type { MemoryRepositoryOptions } from '../entity/types.ts';

/**
 * Runs in the registry (entity `run`, key `id`, `parentRunId` referencing
 * another run, `conversation.scope.id` a conversation), stored as given.
 */
export class MemoryRunRepository extends MemoryEntityRepository<Run> implements IRunRepository {
    constructor(options: MemoryRepositoryOptions) {
        super({
            entity: 'run',
            registry: options.registry,
            key: ['id'],
            references: [
                { field: 'parentRunId', entity: 'run' },
                { field: 'conversation.scope.id', entity: 'conversation' },
            ],
        });
    }

    async findByWaitKind(kind: WaitPoint['kind'], query: IQuery): Promise<EntityFindManyResult<Run>> {
        return this.findManyWhere(query, (row) => isObject(row.waiting) && row.waiting.kind === kind);
    }

    /**
     * Whether a committed run has this id; synchronous, for the memory
     * repositories outside the registry that refuse rows of an unknown run.
     */
    has(id: string): boolean {
        return this.registry.read(this.entity, this.registry.keyOf(this.entity, { id })) !== undefined;
    }
}
