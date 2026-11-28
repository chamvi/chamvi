/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { EntityRelationError } from '@chamvi/errors';
import { defineQuery, eq } from '@rapiq/core';
import { uuidv7 } from 'uuidv7';
import { STEP_STORED_ORDER } from '@chamvi/core-kit';
import type { Step } from '@chamvi/core-kit';
import type { IStepRepository } from '@chamvi/store';
import { RepositoryNotFoundError, RunNotFoundError } from '../errors/index.ts';
import { readStep } from './helpers.ts';
import type { IStepService, StepServiceContext } from './types.ts';

/** The steps of runs over an `IStepRepository`: appended, listed by index, then in the order they were stored. */
export class StepService implements IStepService {
    protected repository: IStepRepository;

    constructor(ctx: StepServiceContext) {
        this.repository = ctx.repository;
    }

    async create(step: Step): Promise<void> {
        try {
            await this.repository.transaction(async (repository) => {
                await repository.save(repository.create({ ...step, id: uuidv7() }));
            });
        } catch (error) {
            if (error instanceof EntityRelationError && error.relation === 'run') {
                throw new RunNotFoundError(step.runId);
            }

            throw error;
        }
    }

    async find(runId: string): Promise<Step[]> {
        const { data } = await this.repository.findMany(defineQuery({
            filters: eq('runId', runId),
            sorts: { index: 'ASC', [STEP_STORED_ORDER]: 'ASC' },
        }));

        return data.map((record) => readStep(record));
    }

    async findOrFail(runId: string): Promise<Step[]> {
        const steps = await this.find(runId);

        if (steps.length === 0) {
            throw new RepositoryNotFoundError('steps');
        }

        return steps;
    }
}
