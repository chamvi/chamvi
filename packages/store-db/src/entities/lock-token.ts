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
import { BIGINT_NUMBER_TRANSFORMER, TableName } from './constants.ts';

/** The single row (`key` `lock`) holding the last fencing token the lock store issued. */
@Entity({ name: TableName.LOCK_TOKENS })
export class LockTokenEntity {
    @PrimaryColumn({ type: 'uuid', update: false })
    id!: string;

    /** A constant: the unique key that keeps the counter a single row. */
    @Index({ unique: true })
    @Column({
        name: 'key',
        type: 'varchar',
        length: 32,
        collation: 'C',
        update: false,
    })
    key!: string;

    @Column({
        name: 'value',
        type: 'bigint',
        transformer: BIGINT_NUMBER_TRANSFORMER,
    })
    value!: number;
}
