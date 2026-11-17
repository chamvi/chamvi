// #region types
// src/core/ticket/types.ts: what the service and its repositories exchange
import type { IEntityRepository } from '@chamvi/app';

export type Ticket = {
    id: string;
    title: string;
    reporter: string;
    status: 'open' | 'closed';
    version: number;
    /** An instant, as an ISO 8601 UTC string. */
    openedAt: string;
    closedAt: string | null;
};

/** The port the service takes: the generic entity port; an app adds its own finders here. */
export interface ITicketRepository extends IEntityRepository<Ticket> {}
// #endregion types
