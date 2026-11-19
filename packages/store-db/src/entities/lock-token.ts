/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Column, Entity, PrimaryColumn } from 'typeorm';
import { BIGINT_NUMBER_TRANSFORMER, TableName } from './constants.ts';

/** The single row (`id` 1) holding the last fencing token the lock store issued. */
@Entity({ name: TableName.LOCK_TOKENS })
export class LockTokenEntity {
    @PrimaryColumn({ type: 'smallint', update: false })
    id!: number;

    @Column({
        name: 'value',
        type: 'bigint',
        transformer: BIGINT_NUMBER_TRANSFORMER,
    })
    value!: number;
}
