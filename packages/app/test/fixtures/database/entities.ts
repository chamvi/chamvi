/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/* eslint-disable max-classes-per-file */
import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryColumn,
    Unique,
} from 'typeorm';

// compiled with decorator metadata (test/vitest.config.ts): `publishedAt` takes its type from `design:type` Date

@Entity({ name: 'fixture_authors' })
@Unique('fixture_authors_name_key', ['name'])
export class AuthorEntity {
    @PrimaryColumn({ type: 'uuid', primaryKeyConstraintName: 'fixture_authors_pkey' })
    id!: string;

    @Column({ type: 'varchar', length: 128 })
    name!: string;
}

@Entity({ name: 'fixture_notes' })
export class NoteEntity {
    @PrimaryColumn({ type: 'uuid', primaryKeyConstraintName: 'fixture_notes_pkey' })
    id!: string;

    @Column({ type: 'text' })
    body!: string;

    @Column({ nullable: true })
    publishedAt?: Date;

    @CreateDateColumn()
    createdAt!: Date;

    @Column({ type: 'uuid' })
    authorId!: string;

    @ManyToOne(() => AuthorEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'authorId', foreignKeyConstraintName: 'fixture_notes_author_fkey' })
    author?: AuthorEntity;
}

/** The entity of a second database module. */
@Entity({ name: 'fixture_tags' })
export class TagEntity {
    @PrimaryColumn({
        type: 'varchar',
        length: 64,
        primaryKeyConstraintName: 'fixture_tags_pkey',
    })
    name!: string;
}
