/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Column, Entity, PrimaryColumn } from 'typeorm';

/** A date column typed as a union: its `design:type` is Object, so TypeORM cannot derive the date type. */
@Entity({ name: 'fixture_late' })
export class LateEntity {
    @PrimaryColumn({ type: 'varchar', length: 36 })
    id!: string;

    @Column({ nullable: true })
    when!: Date | null;
}
