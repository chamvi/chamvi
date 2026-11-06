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

@Index(['agent'], { unique: true })
@Entity({ name: TableName.AGENT_REVISIONS })
export class AgentRevisionEntity {
    @PrimaryColumn({ type: 'uuid', default: () => 'chamvi_uuid_v7()' })
    id!: string;

    @Column({
        name: 'agent',
        type: 'varchar',
        length: 64,
        collation: 'C',
    })
    agent!: string;

    @Column({
        name: 'hash',
        type: 'varchar',
        length: 128,
    })
    hash!: string;

    @Column({ name: 'changed_at', type: 'timestamp with time zone' })
    changedAt!: Date;
}
