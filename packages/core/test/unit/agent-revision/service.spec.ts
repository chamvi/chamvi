/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import { MemoryAgentRevisionRepository, MemoryRegistry } from '@chamvi/store-memory';
import type { AgentRevision } from '@chamvi/store';
import { AgentRevisionService, type IAgentRevisionService, RepositoryNotFoundError } from '../../../src/index.ts';

function marker(agent: string, overrides: Partial<AgentRevision> = {}): AgentRevision {
    return {
        agent,
        hash: 'h1',
        changedAt: new Date(1_000),
        ...overrides,
    };
}

describe('AgentRevisionService', () => {
    let repository: MemoryAgentRevisionRepository;
    let revisions: IAgentRevisionService;

    beforeEach(() => {
        repository = new MemoryAgentRevisionRepository({ registry: new MemoryRegistry() });
        revisions = new AgentRevisionService({ repository });
    });

    it('reads an unknown agent as undefined and no marker as []; the OrFail reads throw RepositoryNotFoundError with today\'s message', async () => {
        expect(await revisions.findOne('missing')).toBeUndefined();
        expect(await revisions.find()).toEqual([]);

        const { message } = new RepositoryNotFoundError('agent revisions');

        for (const read of [revisions.findOneOrFail('missing'), revisions.findOrFail()]) {
            const error = await read.catch((caught: unknown) => caught);

            expect(error).toBeInstanceOf(RepositoryNotFoundError);
            expect(error).toMatchObject({ code: 'repository_not_found', message });
        }

        // nothing was created by the reads
        expect(await repository.findManyBy({})).toEqual([]);
    });

    it('save inserts and returns what the next read returns: the marker alone, changedAt a Date', async () => {
        const saved = await revisions.save(marker('a'));

        expect(saved).toStrictEqual(marker('a'));
        expect(saved.changedAt).toBeInstanceOf(Date);
        expect(await revisions.findOne('a')).toStrictEqual(saved);
        expect(await revisions.findOneOrFail('a')).toStrictEqual(saved);
        expect(await revisions.findOrFail()).toStrictEqual([saved]);
    });

    it('save upserts: a later save of the agent replaces hash and changedAt, one row, its uuid v7 storage id kept', async () => {
        await revisions.save(marker('a'));

        const { id } = (await repository.findOneBy({ agent: 'a' }))!;

        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        expect(await revisions.save(marker('a', { hash: 'h2', changedAt: new Date(2_000) })))
            .toStrictEqual(marker('a', { hash: 'h2', changedAt: new Date(2_000) }));
        expect(await revisions.findOne('a')).toStrictEqual(marker('a', { hash: 'h2', changedAt: new Date(2_000) }));
        expect(await revisions.find()).toHaveLength(1);
        expect((await repository.findOneBy({ agent: 'a' }))!.id).toBe(id);
    });

    it('save stores the marker fields only: an extra property is not stored', async () => {
        const saved = await revisions.save({ ...marker('a'), extra: 1 } as AgentRevision);

        expect(saved).toStrictEqual(marker('a'));
        expect(await revisions.findOne('a')).toStrictEqual(marker('a'));
    });

    it('delete removes the marker and ignores a missing one; the others stay', async () => {
        await revisions.save(marker('a'));
        await revisions.save(marker('b'));

        await revisions.delete('a');
        expect(await revisions.findOne('a')).toBeUndefined();
        await expect(revisions.delete('missing')).resolves.toBeUndefined();
        expect(await revisions.find()).toStrictEqual([marker('b')]);
    });

    it('find lists every marker by agent in code-point order', async () => {
        for (const agent of ['b', 'a_b', 'a-b', 'a', 'B']) {
            await revisions.save(marker(agent));
        }

        expect((await revisions.find()).map((revision) => revision.agent)).toEqual(['B', 'a', 'a-b', 'a_b', 'b']);
        expect((await revisions.findOrFail()).map((revision) => revision.agent)).toEqual(['B', 'a', 'a-b', 'a_b', 'b']);
    });

    it('copies markers in and out', async () => {
        const value = marker('a');

        await revisions.save(value);
        value.hash = 'evil';
        value.changedAt.setTime(0);
        expect(await revisions.findOne('a')).toStrictEqual(marker('a'));

        const read = (await revisions.findOne('a'))!;

        read.hash = 'evil';
        read.changedAt.setTime(0);

        const [listed] = await revisions.find();

        expect(listed!.changedAt).toBeInstanceOf(Date);
        listed!.changedAt.setTime(0);

        const returned = await revisions.save(marker('b'));

        returned.changedAt.setTime(0);
        expect(await revisions.findOne('a')).toStrictEqual(marker('a'));
        expect(await revisions.find()).toStrictEqual([marker('a'), marker('b')]);
    });

    it('concurrent saves of one agent all resolve and leave one marker', async () => {
        const results = await Promise.all(Array.from({ length: 20 }, (_, i) => revisions.save(marker('a', { hash: `h${i}` }))));

        expect(results.map((result) => result.hash)).toEqual(Array.from({ length: 20 }, (_, i) => `h${i}`));
        expect(await repository.findManyBy({ agent: 'a' })).toHaveLength(1);
        expect(results.map((result) => result.hash)).toContain((await revisions.findOneOrFail('a')).hash);
    });
});
