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

@Index(['scope', 'key'], { unique: true })
@Entity({ name: TableName.IDEMPOTENCY_KEYS })
export class IdempotencyKeyEntity {
    @PrimaryColumn({ type: 'uuid', update: false })
    id!: string;

    @Column({
        name: 'scope', 
        type: 'varchar', 
        length: 1024, 
        collation: 'C',
    })
    scope!: string;

    @Column({
        name: 'key', 
        type: 'varchar', 
        length: 512, 
        collation: 'C',
    })
    key!: string;

    @Column({
        name: 'run_id', 
        type: 'uuid', 
    })
    // The reservation precedes createRun and can outlive a failed creation.
    runId!: string;

    @Index()
    @Column({ name: 'expires_at', type: 'timestamp with time zone' })
    expiresAt!: Date;
}
