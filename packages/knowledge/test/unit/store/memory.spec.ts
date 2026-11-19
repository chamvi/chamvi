/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { KnowledgeService, createMemoryKnowledgeRepository } from '@chamvi/knowledge';
import { describe, expect, it } from 'vitest';
import { ControllableClock, describeKnowledgeRepositoryContract } from '@chamvi/test-kit';

describeKnowledgeRepositoryContract({
    name: 'memory',
    create: () => new KnowledgeService({
        repository: createMemoryKnowledgeRepository(),
        clock: new ControllableClock(new Date('2026-11-01T00:00:00Z')),
    }),
});

describe('memory chunk updateOrigin', () => {
    it('changes the title and source of one document generation only and keeps vectors', async () => {
        const repository = createMemoryKnowledgeRepository();
        const service = new KnowledgeService({
            repository,
            clock: new ControllableClock(new Date('2026-11-01T00:00:00Z')),
        });
        const { id } = await service.saveCollection({
            name: 'docs',
            kind: 'managed',
            trusted: false,
            model: 'm',
            chunker: 'c',
            generation: 1,
        } as never);
        const origin = { title: 'A', source: 'a.md' };
        const chunk = (index: number, text: string) => ({
            index, 
            text, 
            vector: [1, 0], 
            start: 0, 
            end: text.length, 
            ...origin,
        });

        await service.replaceChunks('docs', 'a', 1, [chunk(0, 'a0'), chunk(1, 'a1')] as never);
        await service.replaceChunks('docs', 'a', 2, [chunk(0, 'a2')] as never);
        await service.replaceChunks('docs', 'b', 1, [chunk(0, 'b0')] as never);

        const where = {
            collectionId: id, 
            document: 'a', 
            generation: 1, 
        };

        expect(await repository.chunks.updateOrigin(where, { title: 'B' })).toBe(2);

        const rows = await repository.chunks.findManyBy({ collectionId: id });
        const view = rows.map((row) => [row.document, row.generation, row.title, row.source, row.vector]);

        expect(view).toEqual(expect.arrayContaining([
            ['a', 1, 'B', undefined, [1, 0]],
            ['a', 2, 'A', 'a.md', [1, 0]],
            ['b', 1, 'A', 'a.md', [1, 0]],
        ]));
        expect(await repository.chunks.updateOrigin({ ...where, document: 'zzz' }, {})).toBe(0);
        expect(await repository.chunks.updateOrigin(where, {})).toBe(2);
        expect((await repository.chunks.findManyBy(where)).every((row) => row.title === undefined && row.source === undefined)).toBe(true);
    });
});
