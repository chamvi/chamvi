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
import { JSON_VALUE_TRANSFORMER, TableName } from './constants.ts';

@Index(['key'], { unique: true })
@Entity({ name: TableName.EFFECTS })
export class EffectEntity {
    @PrimaryColumn({ type: 'uuid', default: () => 'chamvi_uuid_v7()' })
    id!: string;

    @Column({
        name: 'key', 
        type: 'varchar', 
        length: 512, 
    })
    key!: string;

    @Column({
        name: 'result', 
        type: 'jsonb',
        nullable: true,
        transformer: JSON_VALUE_TRANSFORMER,
    })
    result!: unknown;
}
