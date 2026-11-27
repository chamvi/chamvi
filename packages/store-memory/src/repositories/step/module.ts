/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { EntityQueryError } from '@chamvi/errors';
import { STEP_STORED_ORDER } from '@chamvi/core-kit';
import type { Step } from '@chamvi/core-kit';
import type { EntityRecord, IStepRepository } from '@chamvi/store';
import type { MemoryRegistry } from '../../registry/module.ts';
import { MemoryEntityRepository } from '../../entity/module.ts';
import type { MemoryRepositoryOptions } from '../../entity/types.ts';

/** The last storage key handed out per registry, like a database sequence. */
const sequences = new WeakMap<MemoryRegistry, number>();

/**
 * Steps in the registry (entity `step`, `runId` referencing a run). A step
 * gets its storage key (`STEP_STORED_ORDER`) when it is saved, in the order
 * steps are saved, as a database's identity column; reads never return it.
 */
export class MemoryStepRepository extends MemoryEntityRepository<Step> implements IStepRepository {
    constructor(options: MemoryRepositoryOptions) {
        super({
            entity: 'step',
            registry: options.registry,
            key: [STEP_STORED_ORDER as keyof Step],
            references: [{ field: 'runId', entity: 'run' }],
        });
    }

    override async save(entity: Step): Promise<Step> {
        const row = entity as EntityRecord;

        if (this.created.has(entity) && row[STEP_STORED_ORDER] === undefined) {
            const key = (sequences.get(this.registry) ?? 0) + 1;

            sequences.set(this.registry, key);
            row[STEP_STORED_ORDER] = key;
        }

        return super.save(entity);
    }

    /** Steps are append-only: refused with EntityQueryError. */
    override async upsert(): Promise<Step> {
        throw new EntityQueryError({ entity: this.entity });
    }

    /** Steps are append-only: refused with EntityQueryError. */
    override async upsertMany(): Promise<Step[]> {
        throw new EntityQueryError({ entity: this.entity });
    }

    protected override toEntity(row: EntityRecord): Step {
        const step = { ...row };

        delete step[STEP_STORED_ORDER];

        return super.toEntity(step);
    }
}
