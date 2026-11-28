/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { EntityQueryError } from '@chamvi/errors';
import { STEP_STORED_ORDER } from '@chamvi/core-kit';
import type { StepRecord } from '@chamvi/core-kit';
import type { EntityRecord, IStepRepository } from '@chamvi/store';
import type { MemoryRegistry } from '../../registry/module.ts';
import { MemoryEntityRepository } from '../../entity/module.ts';
import type { MemoryRepositoryOptions } from '../../entity/types.ts';

/** The last sequence handed out per registry, like a database sequence. */
const sequences = new WeakMap<MemoryRegistry, number>();

/**
 * Steps in the registry (entity `step`, key `id`, `runId` referencing a
 * run). A step gets its sequence (`STEP_STORED_ORDER`) when it is saved,
 * in the order steps are saved, as a database's identity column; reads
 * never return it.
 */
export class MemoryStepRepository extends MemoryEntityRepository<StepRecord> implements IStepRepository {
    constructor(options: MemoryRepositoryOptions) {
        super({
            entity: 'step',
            registry: options.registry,
            key: ['id'],
            references: [{ field: 'runId', entity: 'run' }],
        });
    }

    override async save(entity: StepRecord): Promise<StepRecord> {
        if (this.created.has(entity)) {
            const sequence = (sequences.get(this.registry) ?? 0) + 1;

            sequences.set(this.registry, sequence);
            (entity as EntityRecord)[STEP_STORED_ORDER] = sequence;
        }

        return super.save(entity);
    }

    /** Steps are append-only: refused with EntityQueryError. */
    override async upsert(): Promise<StepRecord> {
        throw new EntityQueryError({ entity: this.entity });
    }

    /** Steps are append-only: refused with EntityQueryError. */
    override async upsertMany(): Promise<StepRecord[]> {
        throw new EntityQueryError({ entity: this.entity });
    }

    protected override toEntity(row: EntityRecord): StepRecord {
        const step = { ...row };

        delete step[STEP_STORED_ORDER];

        return super.toEntity(step);
    }
}
