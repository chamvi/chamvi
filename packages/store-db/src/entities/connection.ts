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

@Entity({ name: TableName.CONNECTIONS })
export class ConnectionEntity {
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
        name: 'type',
        type: 'varchar',
        length: 64,
    })
    type!: string;

    @Column({
        name: 'key_id',
        type: 'varchar',
        length: 64,
    })
    keyId!: string;

    @Column({ name: 'wrapped_key', type: 'bytea' })
    wrappedKey!: Buffer;

    /** Plain settings, written by `writeConfig`, kept by `replace`. */
    @Column({
        name: 'settings',
        type: 'jsonb',
        default: {},
        transformer: JSON_VALUE_TRANSFORMER,
    })
    settings!: Record<string, unknown>;

    @Column({
        name: 'config_revision',
        type: 'integer',
        default: 0,
    })
    configRevision!: number;

    @Column({ name: 'created_at', type: 'timestamp with time zone' })
    createdAt!: Date;

    @Column({ name: 'updated_at', type: 'timestamp with time zone' })
    updatedAt!: Date;
}
