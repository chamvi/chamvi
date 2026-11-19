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

/**
 * A chunk's row (`KnowledgeChunkRecord`). It references the collection
 * only (chunks may be written before their document's record), and its
 * `embedding` has no fixed length: one collection holds the vectors of
 * every model it was embedded with, a search filters by length.
 */
@Index(['collectionId', 'document', 'generation', 'index'], { unique: true })
@Index(['collectionId', 'generation'])
@Entity({ name: VectorTableName.CHUNKS })
export class KnowledgeChunkEntity {
    @PrimaryColumn({ type: 'uuid', update: false })
    key!: string;

    @Column({ name: 'collection_id', type: 'uuid' })
    collectionId!: string;

    /** The document id: search ties sort by it in code point order. */
    @Column({
        name: 'document',
        type: 'varchar',
        length: 255,
        collation: 'C',
    })
    document!: string;

    @Column({ name: 'generation', type: 'integer' })
    generation!: number;

    @Column({ name: 'index', type: 'integer' })
    index!: number;

    @Column({ name: 'text', type: 'text' })
    text!: string;

    @Column({ name: 'start', type: 'integer' })
    start!: number;

    @Column({ name: 'end', type: 'integer' })
    end!: number;

    @Column({ name: 'embedding', type: 'vector' })
    embedding!: number[];

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

    @ManyToOne(() => KnowledgeCollectionEntity, {
        nullable: false,
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
    })
    @JoinColumn({ name: 'collection_id', referencedColumnName: 'id' })
    collection?: Relation<KnowledgeCollectionEntity>;
}
