// #region repository
// src/adapters/database/ticket.ts: the port on the app's data source, nothing but the mapping
import { EntityRepositoryAdapter } from '@chamvi/store-db';
import type { DataSource, EntityManager } from 'typeorm';
import { TicketEntity } from './entity.ts';
import type { ITicketRepository, Ticket } from './types.ts';

export class DatabaseTicketRepository extends EntityRepositoryAdapter<Ticket, TicketEntity> implements ITicketRepository {
    constructor(source: DataSource | EntityManager) {
        super(source.getRepository(TicketEntity), {
            // the label a storage error names, never a value
            entity: 'ticket',
            alias: 'ticket',
            target: TicketEntity,
        });
    }

    // a transaction hands the service a repository on its manager
    withManager(manager: EntityManager): this {
        return new DatabaseTicketRepository(manager) as this;
    }
}
// #endregion repository
