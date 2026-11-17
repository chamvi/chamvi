// #region app
// src/index.ts: `import 'reflect-metadata';` first, when an entity relies on decorator metadata
import { createApp, databaseModule } from '@chamvi/app';
import { TicketEntity } from './entity.ts';
import { ticketModule } from './module.ts';
import { TICKET_LIST_SCHEMA } from './schema.ts';

export default createApp({
    modules: [
        databaseModule({
            entities: [TicketEntity],
            // the classes `chamvi migration generate` writes, e.g. [TicketInit1795000000000]
            migrations: [],
            migrationsDirectory: new URL('./migrations/', import.meta.url),
            // the app's own table: never `migrations`, which is chamvi's store's
            migrationsTableName: 'ticket_migrations',
            schemas: [TICKET_LIST_SCHEMA],
        }),
        ticketModule(),
    ],
});
// #endregion app
