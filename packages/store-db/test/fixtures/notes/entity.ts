/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Column, Entity, PrimaryColumn } from 'typeorm';
import { dateToISOStringTransformer } from '../../../src/column/index.ts';

/** The app's table: portable column types, so one entity runs on PostgreSQL and SQLite. */
@Entity({ name: 'app_notes' })
export class NoteEntity {
    @PrimaryColumn({ type: 'uuid' })
    id!: string;

    @Column({
        type: 'varchar',
        length: 64,
        unique: true,
    })
    title!: string;

    @Column({ type: 'integer' })
    version!: number;

    // no portable explicit date type: each driver's default for a Date (no decorator metadata in these specs, so named per driver by TypeORM's Date)
    @Column({ type: Date, transformer: dateToISOStringTransformer })
    dueAt!: string;
}
