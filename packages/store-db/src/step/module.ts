/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource, DeepPartial, EntityManager } from 'typeorm';
import { EntityQueryError } from '@chamvi/store';
import type { IStepRepository, Step } from '@chamvi/store';
import { RunEntity, StepEntity } from '../entities/index.ts';
import { EntityRepositoryAdapter } from '../entity/module.ts';

/** The columns of a (partial) step; the generated `id` is never written. */
function toStepEntity(value: Partial<Step>): DeepPartial<StepEntity> {
    return {
        runId: value.runId,
        index: value.index,
        kind: value.kind,
        name: value.name,
        input: value.input,
        output: value.output,
        error: value.error,
        startedAt: value.startedAt,
        finishedAt: value.finishedAt,
    } as DeepPartial<StepEntity>;
}

/** The step of a row: a NULL column is an absent property, the storage key is left out. */
function fromStepEntity(entity: StepEntity): Step {
    const step: Step = {
        runId: entity.runId,
        index: entity.index,
        kind: entity.kind,
        startedAt: entity.startedAt,
        finishedAt: entity.finishedAt,
    };

    if (entity.name !== null) {
        step.name = entity.name;
    }

    if (entity.input !== null) {
        step.input = entity.input;
    }

    if (entity.output !== null) {
        step.output = entity.output;
    }

    if (entity.error !== null) {
        step.error = entity.error;
    }

    return step;
}

/** Steps in `chamvi_steps`; the bigint identity `id` orders the steps of one index. */
export class DatabaseStepRepository extends EntityRepositoryAdapter<Step, StepEntity> implements IStepRepository {
    constructor(source: DataSource | EntityManager) {
        super(source.getRepository(StepEntity), {
            entity: 'step',
            alias: 'step',
            target: StepEntity,
            toEntity: toStepEntity,
            fromEntity: fromStepEntity,
            related: [{ target: RunEntity, entity: 'run' }],
        });
    }

    withManager(manager: EntityManager): this {
        return new DatabaseStepRepository(manager) as this;
    }

    /** Steps are append-only (their identity `id` is no key a caller holds): refused with EntityQueryError. */
    override async upsert(): Promise<Step> {
        throw new EntityQueryError(this.options.entity);
    }

    /** Steps are append-only: refused with EntityQueryError. */
    override async upsertMany(): Promise<Step[]> {
        throw new EntityQueryError(this.options.entity);
    }
}
