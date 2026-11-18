/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { uuidv7 } from 'uuidv7';
import { EntityConflictError, EntityRelationError } from '@chamvi/store';
import type { Checkpoint, ICheckpointRepository } from '@chamvi/store';
import { RepositoryNotFoundError, RunNotFoundError } from '../errors/index.ts';
import { readCheckpoint } from './helpers.ts';
import type { CheckpointServiceContext, ICheckpointService } from './types.ts';

/**
 * The latest checkpoint of each run over an `ICheckpointRepository`: a
 * save keeps the highest `stepIndex`, an equal index replaces (approval
 * answers are appended that way). Each save reads the run's row locked,
 * compares and writes in one transaction.
 */
export class CheckpointService implements ICheckpointService {
    protected repository: ICheckpointRepository;

    constructor(ctx: CheckpointServiceContext) {
        this.repository = ctx.repository;
    }

    async save(checkpoint: Checkpoint): Promise<Checkpoint> {
        try {
            return await this.write(checkpoint);
        } catch (error) {
            // two first checkpoints of one run raced and this insert lost: the row exists now
            if (error instanceof EntityConflictError) {
                return this.write(checkpoint);
            }

            throw error;
        }
    }

    async findOne(runId: string): Promise<Checkpoint | undefined> {
        const record = await this.repository.findOneBy({ runId });

        return record ? readCheckpoint(record) : undefined;
    }

    async findOneOrFail(runId: string): Promise<Checkpoint> {
        const checkpoint = await this.findOne(runId);

        if (!checkpoint) {
            throw new RepositoryNotFoundError('checkpoints');
        }

        return checkpoint;
    }

    protected async write(checkpoint: Checkpoint): Promise<Checkpoint> {
        const value: Checkpoint = {
            runId: checkpoint.runId,
            stepIndex: checkpoint.stepIndex,
            messages: checkpoint.messages,
            finishReason: checkpoint.finishReason,
            conversation: checkpoint.conversation,
            createdAt: checkpoint.createdAt,
        };

        try {
            return await this.repository.transaction(async (repository) => {
                const stored = await repository.findOneBy({ runId: checkpoint.runId });

                if (!stored) {
                    return readCheckpoint(await repository.save(repository.create({ ...value, id: uuidv7() })));
                }

                if (checkpoint.stepIndex < stored.stepIndex) {
                    return readCheckpoint(stored);
                }

                // the whole checkpoint is replaced: a property it leaves out is cleared
                repository.merge(stored, value);

                return readCheckpoint(await repository.save(stored));
            });
        } catch (error) {
            if (error instanceof EntityRelationError && error.relation === 'run') {
                throw new RunNotFoundError(checkpoint.runId);
            }

            throw error;
        }
    }
}
