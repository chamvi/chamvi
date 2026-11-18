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
import { KnowledgeCollectionEntity } from './collection.ts';
import { VectorTableName } from './constants.ts';

/** A document's row (`KnowledgeDocumentRecord`); removed with its collection. */
@Index(['collectionId', 'id'], { unique: true })
@Index(['collectionId', 'status', 'id'])
@Entity({ name: VectorTableName.DOCUMENTS })
export class KnowledgeDocumentEntity {
    @PrimaryColumn({ type: 'uuid', update: false })
    key!: string;

    @Column({ name: 'collection_id', type: 'uuid' })
    collectionId!: string;

    /** The document id: listings sort by it in code point order. */
    @Column({
        name: 'id',
        type: 'varchar',
        length: 255,
        collation: 'C',
    })
    id!: string;

    @Column({ name: 'content', type: 'text' })
    content!: string;

    @Column({
        name: 'hash', 
        type: 'varchar', 
        length: 255, 
    })
    hash!: string;

    @Column({
        name: 'title', 
        type: 'text', 
        nullable: true, 
    })
    title!: string | null;

    @Column({
        name: 'source', 
        type: 'text', 
        nullable: true, 
    })
    source!: string | null;

    @Column({
        name: 'metadata', 
        type: 'jsonb', 
        nullable: true, 
    })
    metadata!: Record<string, unknown> | null;

    @Column({
        name: 'status',
        type: 'varchar',
        length: 16,
        collation: 'C',
    })
    status!: string;

    @Column({
        name: 'error', 
        type: 'text', 
        nullable: true, 
    })
    error!: string | null;

    @Column({ name: 'generation', type: 'integer' })
    generation!: number;

    @Column({ name: 'updated_at', type: 'timestamp with time zone' })
    updatedAt!: Date;

    @ManyToOne(() => KnowledgeCollectionEntity, {
        nullable: false,
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
    })
    @JoinColumn({ name: 'collection_id', referencedColumnName: 'id' })
    collection?: Relation<KnowledgeCollectionEntity>;
}
