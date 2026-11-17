// #region module
// src/app/modules/ticket.ts: the service on the database module's data source
import { AppToken, DatabaseToken } from '@chamvi/app';
import type { IModule } from '@chamvi/app';
import { TicketController } from './controller.ts';
import { DatabaseTicketRepository } from './repository.ts';
import { TicketService } from './service.ts';

export function ticketModule(): IModule {
    return {
        name: 'ticket',
        // set up after the database module: its data source is registered then
        dependencies: ['chamvi:db:default'],

        async setup(container) {
            container.registerMany(AppToken.HTTP_CONTROLLERS, {
                useFactory: (c) => {
                    const repository = new DatabaseTicketRepository(c.resolve(DatabaseToken.DATA_SOURCE));
                    const service = new TicketService({ repository, clock: c.resolve(AppToken.CLOCK) });

                    return new TicketController({ service });
                },
            });
        },
    };
}
// #endregion module
