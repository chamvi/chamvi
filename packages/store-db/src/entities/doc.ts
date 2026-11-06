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

@Index('IDX_chamvi_docs_doc_gin', ['doc'], { type: 'gin' })
@Index(['agent', 'collection', 'id'], { unique: true })
@Entity({ name: TableName.DOCS })
export class DocEntity {
    @PrimaryColumn({
        name: 'row_id',
        type: 'uuid',
        default: () => 'chamvi_uuid_v7()',
    })
    rowId!: string;

    @Column({
        name: 'agent', 
        type: 'varchar', 
        length: 64, 
    })
    agent!: string;

    @Column({
        name: 'collection', 
        type: 'varchar', 
        length: 255, 
    })
    collection!: string;

    @Column({
        name: 'id', 
        type: 'varchar', 
        length: 255, 
    })
    id!: string;

    @Column({
        name: 'doc',
        type: 'jsonb',
        transformer: JSON_VALUE_TRANSFORMER,
    })
    doc!: unknown;
}
