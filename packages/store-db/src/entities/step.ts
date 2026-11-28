/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    Column,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import type { StepRecord } from '@chamvi/core-kit';
import { OPTIONAL_JSON_TRANSFORMER, TableName } from './constants.ts';
import { RunEntity } from './run.ts';

@Index(['runId', 'index', 'sequence'])
@Entity({ name: TableName.STEPS })
export class StepEntity {
    @PrimaryColumn({ type: 'uuid' })
    id!: string;

    /** The order steps were stored in, assigned by the database; never returned by a read. */
    @Column({
        type: 'bigint',
        generated: 'increment',
        insert: false,
        update: false,
    })
    sequence!: string;

    @Column({
        name: 'run_id',
        type: 'uuid',
    })
    runId!: string;

    @Column({ name: 'step_index', type: 'integer' })
    index!: number;

    @Column({
        name: 'kind',
        type: 'varchar',
        length: 8,
    })
    kind!: StepRecord['kind'];

    @Column({
        name: 'name',
        type: 'varchar',
        length: 255,
        nullable: true,
    })
    name!: string | null;

    @Column({
        name: 'input',
        type: 'jsonb',
        nullable: true,
        transformer: OPTIONAL_JSON_TRANSFORMER,
    })
    input!: unknown;

    @Column({
        name: 'output',
        type: 'jsonb',
        nullable: true,
        transformer: OPTIONAL_JSON_TRANSFORMER,
    })
    output!: unknown;

    @Column({
        name: 'error',
        type: 'jsonb',
        nullable: true,
        transformer: OPTIONAL_JSON_TRANSFORMER,
    })
    error!: unknown;

    @Column({ name: 'started_at', type: 'timestamp with time zone' })
    startedAt!: Date;

    @Column({ name: 'finished_at', type: 'timestamp with time zone' })
    finishedAt!: Date;

    @ManyToOne(() => RunEntity, {
        nullable: false,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
    })
    @JoinColumn({ name: 'run_id', referencedColumnName: 'id' })
    run?: Relation<RunEntity>;
}
