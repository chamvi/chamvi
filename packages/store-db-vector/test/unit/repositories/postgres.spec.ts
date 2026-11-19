/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import {
    KnowledgeService,
    createKnowledge,
    defineKnowledgeSource,
    knowledgeCollection,
} from '@chamvi/knowledge';
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
    vi,
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

/**
 * Releases the gate once `waiting` statements wait on a row lock; when they
 * never do, releases it anyway and settles the started operations before
 * failing, so no transaction stays open into the next spec.
 */
async function releaseAfterLockWait(
    dataSource: DataSource,
    gate: { release: () => void },
    started: Promise<unknown>[],
    waiting = 1,
): Promise<void> {
    try {
        await untilLockWait(dataSource, waiting);
    } catch (error) {
        gate.release();
        await Promise.allSettled(started);

        throw error;
    }

    gate.release();
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

    it('a restart embeds nothing for a document whose title, source or metadata the store sanitized', async () => {
        const dirty = 'a\0b\uD800c';
        const model = mockEmbeddingModel();
        const source = defineKnowledgeSource({
            async* documents() {
                yield {
                    id: 'a',
                    content: 'Unchanged text.',
                    title: dirty,
                    source: dirty,
                    metadata: { [dirty]: dirty },
                };
            },
        });
        const options = {
            repository,
            locks: createTestEngine({ agents: [], clock }).lockService,
            clock,
            collections: [knowledgeCollection('docs', { model, sources: [source] })],
        };
        const first = createKnowledge(options);

        first.start();
        await vi.waitFor(async () => {
            expect(await service.findOneCollection('docs')).toMatchObject({ status: 'ready' });
        });
        await first.stop();

        const calls = model.calls.length;

        clock.advance(1000);

        const second = createKnowledge(options);

        second.start();
        await vi.waitFor(async () => {
            expect((await service.findOneCollectionOrFail('docs')).updatedAt.getTime()).toBe(clock.now());
        });
        await second.stop();

        expect(calls).toBeGreaterThan(0);
        expect(model.calls).toHaveLength(calls);
    });

    it('search with minScore skips chunks of another vector length instead of failing', async () => {
        await service.saveCollection(collectionOf('docs'));
        await service.replaceChunks('docs', 'a', 1, [chunkOf(0, [1, 0], 'two')]);
        await service.replaceChunks('docs', 'b', 1, [chunkOf(0, [1, 0, 0], 'three')]);

        expect((await service.search('docs', 1, [1, 0], { topK: 10, minScore: 0.5 })).map((match) => match.text)).toEqual(['two']);
        expect((await service.search('docs', 1, [0, 1, 0], { topK: 10, minScore: 0.5 }))).toEqual([]);
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

        await releaseAfterLockWait(dataSource, gate, [writing, deleting]);

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

        // each expectation attached at once: a write refused before another is awaited is no unhandled rejection
        const fenced = expect(service.replaceChunks('docs', 'a', 1, [chunkOf(0, [1, 0])], { fence: fence! }))
            .rejects.toMatchObject({ code: 'repository_not_found' });
        const unfenced = expect(service.saveDocument(documentOf('docs', 'a')))
            .rejects.toMatchObject({ code: 'repository_not_found' });

        await releaseAfterLockWait(dataSource, gate, [deleting, fenced, unfenced], 2);

        expect(await deleting).toBe(true);
        await fenced;
        await unfenced;

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

        // attached at once: refused may settle before writing is awaited
        const refused = expect(service.replaceChunks('docs', 'a', 1, [chunkOf(0, [1, 0], 'stale')], { fence: stale! }))
            .rejects.toMatchObject({ code: 'lease_lost', lock: 'knowledge:docs' });

        await releaseAfterLockWait(dataSource, gate, [writing, refused]);

        await writing;
        await refused;
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
