/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { BIGINT_NUMBER_TRANSFORMER } from '@chamvi/store-db';
import {
    Column,
    Entity,
    Index,
    PrimaryColumn,
} from 'typeorm';
import { VectorTableName } from './constants.ts';

/** A knowledge collection's row (`KnowledgeCollectionRecord`); `pending` is spread over the `pending_*` columns. */
@Entity({ name: VectorTableName.COLLECTIONS })
export class KnowledgeCollectionEntity {
    @PrimaryColumn({ type: 'uuid', update: false })
    id!: string;

    @Index({ unique: true })
    @Column({
        name: 'name',
        type: 'varchar',
        length: 64,
        collation: 'C',
    })
    name!: string;

    @Column({
        name: 'kind',
        type: 'varchar',
        length: 16,
    })
    kind!: string;

    @Column({ name: 'trusted', type: 'boolean' })
    trusted!: boolean;

    @Column({ name: 'generation', type: 'integer' })
    generation!: number;

    @Column({
        name: 'model',
        type: 'text',
    })
    model!: string;

    @Column({
        name: 'dimensions',
        type: 'integer',
        nullable: true,
    })
    dimensions!: number | null;

    @Column({
        name: 'chunker',
        type: 'text',
    })
    chunker!: string;

    @Column({
        name: 'pending_generation',
        type: 'integer',
        nullable: true,
    })
    pendingGeneration!: number | null;

    @Column({
        name: 'pending_model',
        type: 'text',
        nullable: true,
    })
    pendingModel!: string | null;

    @Column({
        name: 'pending_dimensions',
        type: 'integer',
        nullable: true,
    })
    pendingDimensions!: number | null;

    @Column({
        name: 'pending_chunker',
        type: 'text',
        nullable: true,
    })
    pendingChunker!: string | null;

    @Column({
        name: 'last_generation',
        type: 'integer',
        nullable: true,
    })
    lastGeneration!: number | null;

    @Column({
        name: 'status',
        type: 'varchar',
        length: 16,
    })
    status!: string;

    @Column({
        name: 'error',
        type: 'text',
        nullable: true,
    })
    error!: string | null;

    @Column({
        name: 'failures',
        type: 'integer',
        nullable: true,
    })
    failures!: number | null;

    @Column({
        name: 'retry_at',
        type: 'timestamp with time zone',
        nullable: true,
    })
    retryAt!: Date | null;

    @Column({
        name: 'synced_at',
        type: 'timestamp with time zone',
        nullable: true,
    })
    syncedAt!: Date | null;

    @Column({ name: 'created_at', type: 'timestamp with time zone' })
    createdAt!: Date;

    @Column({ name: 'updated_at', type: 'timestamp with time zone' })
    updatedAt!: Date;

    /** The lock token the last pass claimed (lock tokens exceed 2^31); a write naming another one is refused. */
    @Column({
        name: 'fence',
        type: 'bigint',
        default: 0,
        transformer: BIGINT_NUMBER_TRANSFORMER,
    })
    fence!: number;
}
