/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import { KnowledgeService, createKnowledge } from '@chamvi/knowledge';
import type {
    KnowledgeChunkInput,
    KnowledgeCollection,
    KnowledgeCollectionRecord,
    KnowledgeDocument,
} from '@chamvi/knowledge';
import type { EntityWhere } from '@chamvi/store';
import { ControllableClock, createTestEngine, mockEmbeddingModel } from '@chamvi/test-kit';
import type { DataSource, EntityManager } from 'typeorm';
import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import { VectorTableName } from '../../../src/entities/constants.ts';
import { DatabaseKnowledgeRepository } from '../../../src/repositories/index.ts';
import {
    createTestDataSource,
    describePostgres,
    truncateTables,
    untilLockWait,
} from '../../utils/database.ts';

const AT = new Date(1_000);

function collectionOf(name: string, patch: Partial<KnowledgeCollection> = {}): KnowledgeCollection {
    return {
        name,
        kind: 'declared',
        trusted: true,
        generation: 1,
        model: 'mock-provider/mock-model-id',
        dimensions: 2,
        chunker: 'text-v1',
        status: 'ready',
        createdAt: AT,
        updatedAt: AT,
        ...patch,
    };
}

function documentOf(collection: string, id: string, patch: Partial<KnowledgeDocument> = {}): KnowledgeDocument {
    return {
        collection,
        id,
        content: `content of ${id}`,
        hash: `sha256:${id}`,
        status: 'ready',
        generation: 1,
        updatedAt: AT,
        ...patch,
    };
}

function chunkOf(index: number, vector: number[], text = `chunk ${index}`, patch: Partial<KnowledgeChunkInput> = {}): KnowledgeChunkInput {
    return {
        index,
        text,
        start: 0,
        end: text.length,
        vector,
        ...patch,
    };
}

/**
 * Holds the first single-row read inside a transaction (the service's
 * locked read of the collection) until the spec releases it.
 */
class GatedKnowledgeRepository extends DatabaseKnowledgeRepository {
    protected gate: () => Promise<void>;

    constructor(source: DataSource | EntityManager, gate: () => Promise<void>) {
        super(source);
        this.gate = gate;
    }

    override withManager(manager: EntityManager): this {
        return new GatedKnowledgeRepository(manager, this.gate) as this;
    }

    override async findOneBy(where: EntityWhere<KnowledgeCollectionRecord>): Promise<KnowledgeCollectionRecord | null> {
        const found = await super.findOneBy(where);

        if (this.tx) {
            await this.gate();
        }

        return found;
    }
}

/** A gate that reports the first arrival (`held`) and keeps it until `release()`. */
function createGate() {
    const held = Promise.withResolvers<void>();
    const released = Promise.withResolvers<void>();

    return {
        held: held.promise,
        release: () => released.resolve(),
        async pass() {
            held.resolve();
            await released.promise;
        },
    };
}

describePostgres('knowledge repositories on PostgreSQL', () => {
    let dataSource: DataSource;
    let clock: ControllableClock;
    let repository: DatabaseKnowledgeRepository;
    let service: KnowledgeService;

    const count = async (table: string): Promise<number> => {
        const [{ total }] = await dataSource.query(`SELECT count(*)::int AS total FROM "${table}"`);

        return total;
    };

    const gatedService = (gate: ReturnType<typeof createGate>) => new KnowledgeService({
        repository: new GatedKnowledgeRepository(dataSource, () => gate.pass()),
        clock,
    });

    beforeAll(async () => {
        dataSource = await createTestDataSource();
    });

    beforeEach(async () => {
        await truncateTables(dataSource);
        clock = new ControllableClock(new Date('2026-11-01T00:00:00Z'));
        repository = new DatabaseKnowledgeRepository(dataSource);
        service = new KnowledgeService({ repository, clock });
    });

    afterAll(async () => {
        await dataSource.destroy();
    });

    it('search skips chunks of another vector length instead of failing', async () => {
        const { id } = await service.saveCollection(collectionOf('docs'));

        await service.replaceChunks('docs', 'a', 1, [chunkOf(0, [1, 0], 'two')]);
        await service.replaceChunks('docs', 'b', 1, [chunkOf(0, [1, 0, 0], 'three')]);

        const two = await repository.chunks.search(id, 1, [1, 0], { topK: 10 });
        const three = await repository.chunks.search(id, 1, [0, 1, 0], { topK: 10 });

        expect(two.map((match) => match.text)).toEqual(['two']);
        expect(two[0]!.score).toBeCloseTo(1, 6);
        expect(three.map((match) => match.text)).toEqual(['three']);
        expect(three[0]!.score).toBeCloseTo(0, 6);
    });

    it('round-trips NUL and lone surrogates as U+FFFD in content, title, source and metadata', async () => {
        const dirty = 'a\0b\uD800c\uDFFFd';
        const clean = 'a�b�c�d';

        await service.saveCollection(collectionOf('docs', { error: dirty }));
        await service.saveDocument(documentOf('docs', 'a', {
            content: dirty,
            title: dirty,
            source: dirty,
            error: dirty,
            metadata: { [dirty]: dirty, kept: '\u{1F600}' },
        }));
        await service.replaceChunks('docs', 'a', 1, [chunkOf(0, [1, 0], dirty, { title: dirty, source: dirty })]);

        expect((await service.findOneCollectionOrFail('docs')).error).toBe(clean);
        expect(await service.findOneDocumentOrFail('docs', 'a')).toMatchObject({
            content: clean,
            title: clean,
            source: clean,
            error: clean,
            metadata: { [clean]: clean, kept: '\u{1F600}' },
        });
        expect(await service.search('docs', 1, [1, 0], { topK: 1 })).toMatchObject([{
            text: clean,
            title: clean,
            source: clean,
            // UTF-16 offsets hold: every replaced character is one code unit
            index: 0,
        }]);
    });

    it('a PUT with the same metadata answers unchanged although jsonb reorders its keys', async () => {
        const knowledge = createKnowledge({
            repository,
            locks: createTestEngine({ agents: [], clock }).lockService,
            clock,
            embeddingModel: mockEmbeddingModel(),
        });
        // jsonb orders keys by length, then bytes: read back as { n, topic, nested }
        const metadata = {
            topic: 'x',
            nested: { bb: 2, a: 1 },
            n: 1,
        };

        await knowledge.createCollection('notes');

        expect(await knowledge.putDocument('notes', {
            id: 'doc',
            content: 'Refunds.',
            metadata,
        }))
            .toEqual({ status: 'pending', changed: true });
        expect(Object.keys((await service.findOneDocumentOrFail('notes', 'doc')).metadata!)).not.toEqual(Object.keys(metadata));
        expect(await knowledge.putDocument('notes', {
            id: 'doc',
            content: 'Refunds.',
            metadata,
        }))
            .toEqual({ status: 'pending', changed: false });
    });

    it('a delete while a pass writes never resurrects a row', async () => {
        await service.saveCollection(collectionOf('docs'));

        const fence = await service.advanceFence('docs');
        const gate = createGate();
        const writing = gatedService(gate).replaceChunks('docs', 'a', 1, [chunkOf(0, [1, 0])], { fence: fence! });

        await gate.held;

        const deleting = service.deleteCollection('docs');

        await untilLockWait(dataSource);
        gate.release();

        await writing;
        expect(await deleting).toBe(true);

        for (const table of Object.values(VectorTableName)) {
            expect(await count(table), table).toBe(0);
        }
    });

    it('a pass that writes after a delete took the row is refused and writes nothing', async () => {
        await service.saveCollection(collectionOf('docs'));

        const fence = await service.advanceFence('docs');
        const gate = createGate();
        const deleting = gatedService(gate).deleteCollection('docs');

        await gate.held;

        const fenced = service.replaceChunks('docs', 'a', 1, [chunkOf(0, [1, 0])], { fence: fence! });
        const unfenced = service.saveDocument(documentOf('docs', 'a'));

        await untilLockWait(dataSource, 2);
        gate.release();

        expect(await deleting).toBe(true);
        await expect(fenced).rejects.toMatchObject({ code: 'repository_not_found' });
        await expect(unfenced).rejects.toMatchObject({ code: 'repository_not_found' });

        for (const table of Object.values(VectorTableName)) {
            expect(await count(table), table).toBe(0);
        }
    });

    it('two writers with different fences: the stale one is refused, the rows are the fresh one\'s', async () => {
        await service.saveCollection(collectionOf('docs'));
        await service.saveDocument(documentOf('docs', 'a'));

        const stale = await service.advanceFence('docs');
        const fresh = await service.advanceFence('docs');
        const gate = createGate();
        const writing = gatedService(gate).replaceChunks('docs', 'a', 1, [chunkOf(0, [1, 0], 'fresh')], { fence: fresh! });

        await gate.held;

        const refused = service.replaceChunks('docs', 'a', 1, [chunkOf(0, [1, 0], 'stale')], { fence: stale! });

        await untilLockWait(dataSource);
        gate.release();

        await writing;
        await expect(refused).rejects.toMatchObject({ code: 'lease_lost', lock: 'knowledge:docs' });
        await expect(service.updateDocument('docs', 'a', { hash: 'sha256:a' }, { status: 'failed' }, { fence: stale! }))
            .rejects.toMatchObject({ code: 'lease_lost' });

        expect((await service.search('docs', 1, [1, 0], { topK: 10 })).map((match) => match.text)).toEqual(['fresh']);
        expect((await service.findOneDocumentOrFail('docs', 'a')).status).toBe('ready');
    });

    describe('foreign keys', () => {
        it('deleting a collection row removes its documents and chunks', async () => {
            const docs = await service.saveCollection(collectionOf('docs'));

            await service.saveCollection(collectionOf('other'));
            await service.saveDocument(documentOf('docs', 'a'));
            await service.replaceChunks('docs', 'a', 1, [chunkOf(0, [1, 0])]);
            await service.saveDocument(documentOf('other', 'a'));
            await service.replaceChunks('other', 'a', 1, [chunkOf(0, [1, 0])]);

            await repository.remove(docs);

            expect(await count(VectorTableName.COLLECTIONS)).toBe(1);
            expect(await count(VectorTableName.DOCUMENTS)).toBe(1);
            expect(await count(VectorTableName.CHUNKS)).toBe(1);
            expect(await service.findDocumentIds('other')).toEqual(['a']);
        });

        it('refuses a document or chunk of a missing collection, naming both sides', async () => {
            const collectionId = randomUUID();
            const { documents, chunks } = repository;

            await expect(documents.save(documents.create({
                ...documentOf('docs', 'a'),
                key: randomUUID(),
                collectionId,
            }))).rejects.toMatchObject({
                code: 'entity_relation_invalid',
                entity: 'knowledge_document',
                relation: 'knowledge_collection',
            });
            await expect(chunks.upsertMany([chunks.create({
                ...chunkOf(0, [1, 0]),
                key: randomUUID(),
                collectionId,
                document: 'a',
                generation: 1,
            })])).rejects.toMatchObject({
                code: 'entity_relation_invalid',
                entity: 'knowledge_chunk',
                relation: 'knowledge_collection',
            });
            expect(await count(VectorTableName.DOCUMENTS)).toBe(0);
            expect(await count(VectorTableName.CHUNKS)).toBe(0);
        });
    });
});
