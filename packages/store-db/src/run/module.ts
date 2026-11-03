/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    InvalidRunStateError,
    RepositoryNotFoundError,
    RunNotFoundError,
    systemClock,
    waitIdOf,
} from '@chamvi/core';
import type {
    IClock,
    IRunRepository,
    Run,
    RunFindOptions,
    RunUpdateOptions,
} from '@chamvi/core';
import {
    In,
    IsNull,
    LessThanOrEqual,
    MoreThan,
} from 'typeorm';
import type { DataSource, FindOptionsWhere, Repository } from 'typeorm';
import { RunEntity } from '../entities/index.ts';
import {
    toEntity,
    toRun,
    toRunInsertValues,
    toRunValues,
    withRunReference,
} from '../repository/helpers.ts';
import type { DatabaseStoreOptions } from '../repository/types.ts';

export class DatabaseRunRepository implements IRunRepository {
    protected dataSource: DataSource;

    protected clock: IClock;

    constructor(opts: DatabaseStoreOptions) {
        this.dataSource = opts.dataSource;
        this.clock = opts.clock ?? systemClock;
    }

    protected now(): Date {
        return this.clock.now();
    }

    protected get runs(): Repository<RunEntity> {
        return this.dataSource.getRepository(RunEntity);
    }

    async insert(run: Run): Promise<boolean> {
        const write = async () => {
            const result = await this.runs.createQueryBuilder()
                .insert()
                .values(toRunInsertValues(run))
                .orIgnore()
                .returning(['id'])
                .updateEntity(false)
                .execute();

            return result.raw.length === 1;
        };
        const parentRunId = run.trigger.parent?.runId;

        // orIgnore() suppresses only the id conflict: a missing parent still violates the self reference
        return parentRunId === undefined ? write() : withRunReference(this.dataSource, parentRunId, write);
    }

    async findOne(id: string): Promise<Run | undefined> {
        const entity = await this.runs.findOneBy({ id });

        return entity ? toRun(entity) : undefined;
    }

    async findOneOrFail(id: string): Promise<Run> {
        const result = await this.findOne(id);

        if (result === undefined) {
            throw new RunNotFoundError(id);
        }

        return result;
    }

    async update(
        id: string,
        patch: Partial<Run>,
        opts: RunUpdateOptions = {},
    ): Promise<Run> {
        const where: FindOptionsWhere<RunEntity> = { id };

        if (opts.expectStatus) {
            where.status = In(opts.expectStatus);
        }

        if (opts.expectOwner !== undefined) {
            where.claimOwner = opts.expectOwner;
        }

        const query = this.runs.createQueryBuilder()
            .update()
            .set(toRunValues({ ...patch, updatedAt: patch.updatedAt ?? this.now() }))
            .where(where);

        if (opts.expectWaitId !== undefined) {
            // the ORM has no jsonb field operator; a wait point stored without id matches by approvalId
            query.andWhere('COALESCE("waiting"->>\'id\', "waiting"->>\'approvalId\') = :waitId', { waitId: opts.expectWaitId });
        }

        const result = await query
            .returning('*')
            .updateEntity(false)
            .execute();

        if (result.raw.length === 1) {
            return toRun(toEntity(this.dataSource, RunEntity, result.raw[0]));
        }

        const current = await this.runs.findOneBy({ id });

        if (!current) {
            throw new RunNotFoundError(id);
        }

        if (opts.expectStatus && !opts.expectStatus.includes(current.status)) {
            throw new InvalidRunStateError(
                `Run "${id}" is "${current.status}", expected one of: ${opts.expectStatus.join(', ')}.`,
            );
        }

        if (opts.expectOwner !== undefined && current.claimOwner !== opts.expectOwner) {
            throw new InvalidRunStateError(
                `Run "${id}" is not claimed by "${opts.expectOwner}" (claim: ${current.claimOwner ?? 'none'}).`,
            );
        }

        if (opts.expectWaitId !== undefined) {
            const waitId = waitIdOf(toRun(current).waiting);

            if (waitId !== opts.expectWaitId) {
                throw new InvalidRunStateError(
                    `Run "${id}" does not wait on "${opts.expectWaitId}" (wait: ${waitId ?? 'none'}).`,
                );
            }
        }

        throw new InvalidRunStateError(`Run "${id}" changed concurrently.`);
    }

    async find(q: RunFindOptions): Promise<{ data: Run[]; total: number }> {
        const where: FindOptionsWhere<RunEntity> = {};

        if (q.agent !== undefined) {
            where.agent = q.agent;
        }

        if (q.status !== undefined) {
            where.status = In(q.status);
        }

        if (q.concurrencyKey !== undefined) {
            where.concurrencyKey = q.concurrencyKey;
        }

        if (q.ids !== undefined) {
            where.id = In([...q.ids]);
        }

        if (q.parentRunId !== undefined) {
            where.parentRunId = q.parentRunId;
        }

        if (q.limit === 0) {
            // take: 0 means no limit to TypeORM
            return { data: [], total: await this.runs.countBy(where) };
        }

        const direction = q.order === 'desc' ? 'DESC' : 'ASC';
        const [entities, total] = await this.runs.findAndCount({
            where,
            order: { createdAt: direction, id: direction },
            skip: q.offset,
            take: q.limit,
        });

        return { data: entities.map((entity) => toRun(entity)), total };
    }

    async findOrFail(q: RunFindOptions): Promise<{ data: Run[]; total: number }> {
        const result = await this.find(q);

        if (result.data.length === 0) {
            throw new RepositoryNotFoundError('runs');
        }

        return result;
    }

    async claim(id: string, owner: string, ttlMs: number): Promise<boolean> {
        const now = this.now();
        const result = await this.runs.createQueryBuilder()
            .update()
            .set({ claimOwner: owner, claimExpiresAt: new Date(now.getTime() + ttlMs) })
            .where([
                { id, claimOwner: IsNull() },
                { id, claimExpiresAt: LessThanOrEqual(now) },
            ])
            .execute();

        return result.affected === 1;
    }

    async renewClaim(id: string, owner: string, ttlMs: number): Promise<boolean> {
        const now = this.now();
        const result = await this.runs.createQueryBuilder()
            .update()
            .set({ claimExpiresAt: new Date(now.getTime() + ttlMs) })
            .where({
                id,
                claimOwner: owner,
                claimExpiresAt: MoreThan(now),
            })
            .execute();

        return result.affected === 1;
    }
}
