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

/** One sealed configured secret of a connection; removed with its connection, never mixed with entries. */
@Index(['connectionId', 'name'], { unique: true })
@Entity({ name: TableName.CONNECTION_SECRETS })
export class ConnectionSecretEntity {
    @PrimaryColumn({ type: 'uuid', update: false })
    id!: string;

    @Column({
        name: 'connection_id',
        type: 'uuid',
    })
    connectionId!: string;

    @Column({
        name: 'name',
        type: 'varchar',
        length: 64,
        collation: 'C',
    })
    name!: string;

    @Column({ name: 'value', type: 'bytea' })
    value!: Buffer;

    @ManyToOne(() => ConnectionEntity, {
        nullable: false,
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
    })
    @JoinColumn({ name: 'connection_id', referencedColumnName: 'id' })
    connection?: Relation<ConnectionEntity>;
}
