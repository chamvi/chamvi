// #region service
// src/core/ticket/service.ts: every rule lives here, over the port, never a driver
import { randomUUID } from 'node:crypto';
import { scopeQuery } from '@chamvi/app';
import type { EntityFindManyResult, IClock } from '@chamvi/app';
import { BadRequestError, ConflictError, NotFoundError } from '@ebec/http';
import { eq } from '@rapiq/core';
import type { IQuery } from '@rapiq/core';
import type { ITicketRepository, Ticket } from './types.ts';

export class TicketService {
    protected repository: ITicketRepository;

    protected clock: IClock;

    constructor(ctx: { repository: ITicketRepository; clock: IClock }) {
        this.repository = ctx.repository;
        this.clock = ctx.clock;
    }

    async open(reporter: string, title: unknown): Promise<Ticket> {
        if (typeof title !== 'string' || title.length === 0 || title.length > 128) {
            throw new BadRequestError({ message: 'title must be a string of 1 to 128 characters.' });
        }

        // the service sets the id and the time stamp: a repository stores what it is given
        return this.repository.save(this.repository.create({
            id: randomUUID(),
            title,
            reporter,
            status: 'open',
            version: 0,
            openedAt: new Date(this.clock.now()).toISOString(),
            closedAt: null,
        }));
    }

    /** Closes the reporter's ticket when it is still at `version`: a locked read, the checks, the save, in one transaction. */
    async close(reporter: string, id: string, version: number): Promise<Ticket> {
        return this.repository.transaction(async (repository) => {
            // a single-row read inside the transaction locks the row until it ends
            const ticket = await repository.findOneById(id);

            // another reporter's ticket answers as a missing one, so its existence does not leak
            if (!ticket || ticket.reporter !== reporter) {
                throw new NotFoundError({ message: 'The ticket does not exist.' });
            }

            if (ticket.version !== version) {
                throw new ConflictError({ message: 'The ticket changed meanwhile.' });
            }

            // the clock after the lock: a caller that waited compares a fresh time
            return repository.save(repository.merge(ticket, {
                status: 'closed',
                version: version + 1,
                closedAt: new Date(this.clock.now()).toISOString(),
            }));
        });
    }

    /** A page of the reporter's tickets: the client's query, and-ed with the scope. */
    async list(reporter: string, query: IQuery): Promise<EntityFindManyResult<Ticket>> {
        return this.repository.findMany(scopeQuery(query, eq('reporter', reporter)));
    }
}
// #endregion service
