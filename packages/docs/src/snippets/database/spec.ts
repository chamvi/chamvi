// #region spec
// test/unit/ticket/service.spec.ts: one spec body, on memory and on the app's database repository
import { NotFoundError } from '@ebec/http';
import { MemoryRegistry } from '@chamvi/store-memory';
import { ControllableClock, createTestDataSource } from '@chamvi/test-kit';
import { describe, expect, it } from 'vitest';
import { TicketEntity } from './entity.ts';
import { MemoryTicketRepository } from './memory.ts';
import { DatabaseTicketRepository } from './repository.ts';
import { TicketService } from './service.ts';
import type { ITicketRepository } from './types.ts';

const drivers: Array<{ name: string; open(): Promise<{ repository: ITicketRepository; close(): Promise<void> }> }> = [
    {
        name: 'memory',
        open: async () => ({ repository: new MemoryTicketRepository(new MemoryRegistry()), close: async () => {} }),
    },
    {
        // SQLite in memory; createTestDataSource({ entities, url }) creates a PostgreSQL database instead
        name: 'SQLite',
        open: async () => {
            const dataSource = await createTestDataSource({ entities: [TicketEntity] });

            return { repository: new DatabaseTicketRepository(dataSource), close: () => dataSource.destroy() };
        },
    },
];

describe.each(drivers)('TicketService on $name', ({ open }) => {
    it('closes a ticket once when two callers race', async () => {
        const { repository, close } = await open();

        try {
            const service = new TicketService({ repository, clock: new ControllableClock(new Date('2026-01-01T00:00:00Z')) });
            const ticket = await service.open('alice', 'The printer is on fire');

            const results = await Promise.allSettled([service.close('alice', ticket.id, 0), service.close('alice', ticket.id, 0)]);

            expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        } finally {
            await close();
        }
    });

    it('answers another reporter\'s ticket as a missing one and leaves it open', async () => {
        const { repository, close } = await open();

        try {
            const service = new TicketService({ repository, clock: new ControllableClock(new Date('2026-01-01T00:00:00Z')) });
            const ticket = await service.open('alice', 'The printer is on fire');

            await expect(service.close('mallory', ticket.id, 0)).rejects.toBeInstanceOf(NotFoundError);
            await expect(repository.findOneById(ticket.id)).resolves.toMatchObject({ status: 'open', version: 0 });
        } finally {
            await close();
        }
    });
});
// #endregion spec
