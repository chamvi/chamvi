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
    PrimaryColumn,
} from 'typeorm';
import { TableName } from './constants.ts';

@Index(['runId'])
@Entity({ name: TableName.ARTIFACTS })
export class ArtifactEntity {
    @PrimaryColumn({ type: 'uuid', update: false })
    id!: string;

    @Column({
        name: 'run_id',
        type: 'uuid',
    })
    // Attachments are staged before createRun, so this reserved ID cannot have an immediate foreign key.
    runId!: string;

    @Column({
        name: 'agent',
        type: 'varchar',
        length: 64,
    })
    agent!: string;

    @Column({
        name: 'media_type',
        type: 'text',
    })
    mediaType!: string;

    @Column({
        name: 'filename',
        type: 'text',
        nullable: true,
    })
    filename!: string | null;

    @Column({ name: 'size', type: 'integer' })
    size!: number;

    /** Never selected by default: metadata reads leave the bytes in the database. */
    @Column({
        name: 'data',
        type: 'bytea',
        select: false,
    })
    data!: Buffer;

    @Column({ name: 'created_at', type: 'timestamp with time zone' })
    createdAt!: Date;
}
