// #region schema
// src/adapters/http/schemas/ticket.ts: what a client may ask of GET /tickets
import { defineSchema } from '@chamvi/app';
import { TicketEntity } from './entity.ts';
import type { Ticket } from './types.ts';

export const TICKET_LIST_SCHEMA = defineSchema<Ticket>({
    entity: TicketEntity,
    filters: ['status', 'openedAt'],
    sorts: ['openedAt', 'title'],
    sort: { openedAt: 'DESC' },
    maxLimit: 50,
});
// #endregion schema
