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
import { ConnectionEntity } from './connection.ts';
import { TableName } from './constants.ts';

/** One sealed runtime-state entry of a connection; removed with its connection. */
@Index(['connectionName', 'key'], { unique: true })
@Entity({ name: TableName.CONNECTION_ENTRIES })
export class ConnectionEntryEntity {
    @PrimaryColumn({ type: 'uuid', default: () => 'chamvi_uuid_v7()' })
    id!: string;

    @Column({
        name: 'connection_name',
        type: 'varchar',
        length: 64,
        collation: 'C',
    })
    connectionName!: string;

    @Column({
        name: 'key',
        type: 'varchar',
        length: 255,
        collation: 'C',
    })
    key!: string;

    @Column({ name: 'value', type: 'bytea' })
    value!: Buffer;

    @ManyToOne(() => ConnectionEntity, {
        nullable: false,
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
    })
    @JoinColumn({ name: 'connection_name', referencedColumnName: 'name' })
    connection?: Relation<ConnectionEntity>;
}
