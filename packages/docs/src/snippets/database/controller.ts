// #region controller
// src/adapters/http/controllers/ticket.ts: reads the request, calls one service method
import {
    ForceLoggedInMiddleware,
    RequiredJsonBodyMiddleware,
    decodeQuery,
    usePrincipal,
} from '@chamvi/app';
import type { EntityFindManyResult } from '@chamvi/app';
import {
    DBody,
    DContext,
    DController,
    DGet,
    DPath,
    DPost,
} from '@routup/decorators';
import type { IAppEvent } from 'routup';
import { TICKET_LIST_SCHEMA } from './schema.ts';
import type { TicketService } from './service.ts';
import type { Ticket } from './types.ts';

@DController('/tickets')
export class TicketController {
    protected service: TicketService;

    constructor(ctx: { service: TicketService }) {
        this.service = ctx.service;
    }

    // ?filter[status]=open&sort=-openedAt&page[limit]=20; anything the schema does not allow is a 400
    @DGet('', [ForceLoggedInMiddleware])
    async list(@DContext() event: IAppEvent): Promise<EntityFindManyResult<Ticket>> {
        const principal = await usePrincipal(event);

        return this.service.list(principal.id, decodeQuery(event.searchParams, TICKET_LIST_SCHEMA));
    }

    @DPost('', [RequiredJsonBodyMiddleware])
    async open(@DBody() body: { title?: unknown }, @DContext() event: IAppEvent): Promise<Ticket> {
        const principal = await usePrincipal(event);

        return this.service.open(principal.id, body.title);
    }

    @DPost('/:id/close', [RequiredJsonBodyMiddleware])
    async close(@DPath('id') id: string, @DBody() body: { version: number }, @DContext() event: IAppEvent): Promise<Ticket> {
        const principal = await usePrincipal(event);

        return this.service.close(principal.id, id, body.version);
    }
}
// #endregion controller
