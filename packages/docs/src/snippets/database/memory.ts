// #region memory
// test/utils/ticket.ts: the same port in memory, for service specs
import { MemoryEntityRepository } from '@chamvi/store-memory';
import type { MemoryRegistry } from '@chamvi/store-memory';
import type { ITicketRepository, Ticket } from './types.ts';

export class MemoryTicketRepository extends MemoryEntityRepository<Ticket> implements ITicketRepository {
    constructor(registry: MemoryRegistry) {
        super({
            entity: 'ticket',
            registry,
            key: ['id'],
            // filtered as the instant a value names, as a database date column is
            dates: ['openedAt', 'closedAt'],
        });
    }
}
// #endregion memory
