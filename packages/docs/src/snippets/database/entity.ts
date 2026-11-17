// #region entity
// src/core/ticket/entity.ts: one entity for PostgreSQL and SQLite alike
import { dateToISOStringTransformer } from '@chamvi/store-db';
import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'app_tickets' })
export class TicketEntity {
    @PrimaryColumn({ type: 'uuid' })
    id!: string;

    @Column({ type: 'varchar', length: 128 })
    title!: string;

    // the principal that opened it
    @Column({ type: 'varchar', length: 128 })
    reporter!: string;

    // a vocabulary is a varchar, never an enum type
    @Column({ type: 'varchar', length: 16 })
    status!: string;

    @Column({ type: 'integer' })
    version!: number;

    // no explicit date type is valid on both drivers: `Date` takes each driver's own,
    // and the transformer hands the service an ISO 8601 UTC string
    @Column({ type: Date, transformer: dateToISOStringTransformer })
    openedAt!: string;

    @Column({
        type: Date,
        nullable: true,
        transformer: dateToISOStringTransformer,
    })
    closedAt!: string | null;
}
// #endregion entity
