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
@Index(['scope', 'expiresAt'])
@Entity({ name: TableName.LIMIT_USES })
export class LimitUseEntity {
    @PrimaryColumn({ type: 'uuid', update: false })
    id!: string;

    @Column({
        name: 'scope',
        type: 'varchar',
        length: 255,
        collation: 'C',
    })
    scope!: string;

    @Column({
        name: 'key',
        type: 'varchar',
        length: 255,
        collation: 'C',
    })
    key!: string;

    @Column({ name: 'weight', type: 'integer' })
    weight!: number;

    @Column({ name: 'expires_at', type: 'timestamp with time zone' })
    expiresAt!: Date;
}
