/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '@chamvi/core';
import { ValidationError } from '@chamvi/errors';
import { LeaseLostError, RepositoryNotFoundError } from '@chamvi/core';
import { EntityConflictError } from '@chamvi/store';
import {
    and,
    defineQuery,
    eq,
    ne,
} from '@rapiq/core';
import { uuidv7 } from 'uuidv7';
import type {
    IKnowledgeCollectionRepository,
    KnowledgeChunkInput,
    KnowledgeCollection,
    KnowledgeCollectionRecord,
    KnowledgeDocument,
    KnowledgeDocumentDetails,
    KnowledgeDocumentFindOptions,
    KnowledgeDocumentPage,
    KnowledgeDocumentPatch,
    KnowledgeDocumentRecord,
    KnowledgeDocumentStatus,
    KnowledgeDocumentVersion,
    KnowledgeMatch,
    KnowledgeSearchOptions,
} from '../store/types.ts';
import {
    documentFieldsOf,
    isVersion,
    lockKey,
    toCollection,
    toDocument,
    withDetails,
} from './helpers/index.ts';
import type {
    IKnowledgeService,
    KnowledgeFence,
    KnowledgeServiceContext,
    KnowledgeWriteOptions,
} from './types.ts';

/**
 * Knowledge storage over an `IKnowledgeCollectionRepository`, holding every
 * rule: the repositories store and read only.
 *
 * A write runs in one transaction whose first read is the collection row by
 * name (locked), then the documents and chunks through the handed-in
 * repository's children. Reads resolve the collection's row id first.
 * `saveCollection` keeps the stored row's `id` and `fence`; a new row gets
 * a uuid v7 id and fence 0. Only `claimFence` changes a fence (to the
 * lock's token, never down); a write given `{ fence }` compares it with the
 * locked row before it writes.
 */
export class KnowledgeService implements IKnowledgeService {
    protected repository: IKnowledgeCollectionRepository;

    protected clock: IClock;

    constructor(ctx: KnowledgeServiceContext) {
        this.repository = ctx.repository;
        this.clock = ctx.clock;
    }

    async saveCollection(collection: KnowledgeCollection, options: KnowledgeWriteOptions = {}): Promise<KnowledgeCollectionRecord> {
        try {
            return await this.saveCollectionOnce(collection, options);
        } catch (error) {
            if (!(error instanceof EntityConflictError)) {
                throw error;
            }

            // another insert of the name landed between the locked read and the insert: in place, in a new transaction
            return this.saveCollectionOnce(collection, options);
        }
    }

    async claimFence(name: string, token: number): Promise<KnowledgeFence | undefined> {
        return this.repository.transaction(async (repository) => {
            const record = await repository.findOneBy({ name });

            if (!record) {
                return undefined;
            }

            // max seen: a holder with an older lock token never takes the fence back
            if (token < record.fence) {
                throw new LeaseLostError({ lock: lockKey(name) });
            }

            if (token === record.fence) {
                return { id: record.id, fence: token };
            }

            const saved = await repository.save(repository.merge(record, { fence: token }));

            return { id: saved.id, fence: saved.fence };
        });
    }

    async findOneCollection(name: string): Promise<KnowledgeCollection | undefined> {
        const record = await this.repository.findOneBy({ name });

        return record ? toCollection(record) : undefined;
    }

    async findOneCollectionOrFail(name: string): Promise<KnowledgeCollection> {
        const collection = await this.findOneCollection(name);

        if (!collection) {
            throw new RepositoryNotFoundError('knowledge collections');
        }

        return collection;
    }

    async findCollections(): Promise<KnowledgeCollection[]> {
        const { data } = await this.repository.findMany(defineQuery({ sorts: { name: 'ASC' } }));

        return data.map((record) => toCollection(record));
    }

    async deleteCollection(name: string): Promise<boolean> {
        return this.repository.transaction(async (repository) => {
            const record = await repository.findOneBy({ name });

            if (!record) {
                return false;
            }

            await repository.chunks.removeManyBy({ collectionId: record.id });
            await repository.documents.removeManyBy({ collectionId: record.id });
            await repository.remove(record);

            return true;
        });
    }

    async saveDocument(document: KnowledgeDocument, options: KnowledgeWriteOptions = {}): Promise<void> {
        await this.repository.transaction(async (repository) => {
            const record = await this.lockCollectionOrFail(repository, document.collection, options);
            const { documents } = repository;

            await documents.upsertMany([documents.create({
                ...documentFieldsOf(document),
                key: uuidv7(),
                collectionId: record.id,
            })]);
        });
    }

    async findOneDocument(collection: string, id: string): Promise<KnowledgeDocument | undefined> {
        const record = await this.repository.findOneBy({ name: collection });

        if (!record) {
            return undefined;
        }

        const document = await this.repository.documents.findOneBy({ collectionId: record.id, id });

        return document ? toDocument(document, collection) : undefined;
    }

    async findOneDocumentOrFail(collection: string, id: string): Promise<KnowledgeDocument> {
        const document = await this.findOneDocument(collection, id);

        if (!document) {
            throw new RepositoryNotFoundError('knowledge documents');
        }

        return document;
    }

    async findDocumentIds(collection: string): Promise<string[]> {
        const record = await this.repository.findOneBy({ name: collection });

        if (!record) {
            return [];
        }

        const { data } = await this.repository.documents.findMany(defineQuery({
            fields: ['id'],
            filters: eq('collectionId', record.id),
            sorts: { id: 'ASC' },
        }));

        return data.map((document) => document.id);
    }

    async findDocuments(collection: string, options: KnowledgeDocumentFindOptions = {}): Promise<KnowledgeDocumentPage> {
        const record = await this.repository.findOneBy({ name: collection });

        if (!record) {
            return { data: [], total: 0 };
        }

        const limit = options.limit === undefined ? undefined : Math.max(0, options.limit);
        const offset = Math.max(0, options.offset ?? 0);
        const filters = options.status === undefined ?
            eq('collectionId', record.id) :
            and(eq('collectionId', record.id), eq('status', options.status));
        const { data, meta } = await this.repository.documents.findMany(defineQuery({
            filters,
            sorts: { id: 'ASC' },
            pagination: {
                // a page of none still counts the matches: read one row for the total, return none
                ...(limit === undefined ? {} : { limit: limit === 0 ? 1 : limit }),
                ...(offset === 0 ? {} : { offset }),
            },
        }));

        return {
            data: limit === 0 ? [] : data.map((document) => toDocument(document, collection)),
            total: meta.total,
        };
    }

    async updateDocument(
        collection: string,
        id: string,
        version: KnowledgeDocumentVersion,
        patch: KnowledgeDocumentPatch,
        options: KnowledgeWriteOptions = {},
    ): Promise<boolean> {
        return this.repository.transaction(async (repository) => {
            const record = await this.lockCollection(repository, collection, options);

            if (!record) {
                return false;
            }

            const document = await repository.documents.findOneBy({ collectionId: record.id, id });

            if (!document || !isVersion(document, version)) {
                return false;
            }

            const updated: KnowledgeDocumentRecord = {
                ...document,
                status: patch.status,
                ...(patch.generation === undefined ? {} : { generation: patch.generation }),
            };

            delete updated.error;

            if (patch.error !== undefined) {
                updated.error = patch.error;
            }

            await repository.documents.upsertMany([updated]);

            return true;
        });
    }

    async updateDetails(
        collection: string,
        id: string,
        version: KnowledgeDocumentVersion & { status?: KnowledgeDocumentStatus },
        details: KnowledgeDocumentDetails,
    ): Promise<boolean> {
        return this.repository.transaction(async (repository) => {
            const record = await this.lockCollection(repository, collection, {});

            if (!record) {
                return false;
            }

            const document = await repository.documents.findOneBy({ collectionId: record.id, id });

            if (!document || !isVersion(document, version)) {
                return false;
            }

            // a status the caller decided on (a pending document failed meanwhile is requeued, not kept failed)
            if (version.status !== undefined && document.status !== version.status) {
                return false;
            }

            await repository.documents.upsertMany([{
                ...withDetails(document, details),
                updatedAt: new Date(this.clock.now()),
            }]);

            // a pending document's served chunks hold its old content: they keep the details they were written with
            if (document.status !== 'ready') {
                return true;
            }

            // the document's own generation only: another one may hold older text (a re-embed's
            // served generation), which keeps the details it was written with until the switch
            await repository.chunks.updateOrigin(
                {
                    collectionId: record.id, 
                    document: id, 
                    generation: document.generation, 
                },
                { title: details.title, source: details.source },
            );

            return true;
        });
    }

    async requeueGeneration(
        collection: string,
        generation: number,
        target: number,
        limit: number,
        options: KnowledgeWriteOptions = {},
    ): Promise<number> {
        if (generation === target) {
            // the page would never leave the selection: a caller draining until 0 would never end
            throw new ValidationError(`Knowledge collection "${collection}": a requeue needs another target than generation ${generation}.`);
        }

        return this.repository.transaction(async (repository) => {
            const record = await this.lockCollection(repository, collection, options);

            if (!record) {
                return 0;
            }

            // the locked collection row serializes every document write: the listed rows stay as read
            const { data: documents } = await repository.documents.findMany(defineQuery({
                filters: and(eq('collectionId', record.id), eq('generation', generation)),
                sorts: { id: 'ASC' },
                pagination: { limit: Math.max(1, limit) },
            }));

            if (documents.length === 0) {
                return 0;
            }

            await repository.documents.upsertMany(documents.map((document) => {
                const updated: KnowledgeDocumentRecord = {
                    ...document,
                    status: 'pending',
                    generation: target,
                };

                delete updated.error;

                return updated;
            }));

            return documents.length;
        });
    }

    async deleteDocument(collection: string, id: string, options: KnowledgeWriteOptions = {}): Promise<boolean> {
        return this.repository.transaction(async (repository) => {
            const record = await this.lockCollection(repository, collection, options);

            if (!record) {
                return false;
            }

            await repository.chunks.removeManyBy({ collectionId: record.id, document: id });

            return await repository.documents.removeManyBy({ collectionId: record.id, id }) > 0;
        });
    }

    async replaceChunks(
        collection: string,
        document: string,
        generation: number,
        chunks: KnowledgeChunkInput[],
        options: KnowledgeWriteOptions = {},
    ): Promise<void> {
        await this.repository.transaction(async (repository) => {
            const record = await this.lockCollectionOrFail(repository, collection, options);
            const { chunks: rows } = repository;

            await rows.removeManyBy({
                collectionId: record.id,
                document,
                generation,
            });
            await rows.upsertMany(chunks.map((chunk) => rows.create({
                key: uuidv7(),
                collectionId: record.id,
                document,
                generation,
                index: chunk.index,
                text: chunk.text,
                start: chunk.start,
                end: chunk.end,
                vector: chunk.vector,
                ...(chunk.title === undefined ? {} : { title: chunk.title }),
                ...(chunk.source === undefined ? {} : { source: chunk.source }),
            })));
        });
    }

    async deleteGeneration(collection: string, generation: number, options: KnowledgeWriteOptions = {}): Promise<void> {
        await this.repository.transaction(async (repository) => {
            const record = await this.lockCollection(repository, collection, options);

            if (record) {
                await repository.chunks.removeManyBy({ collectionId: record.id, generation });
            }
        });
    }

    async deleteGenerationsExcept(collection: string, generation: number, options: KnowledgeWriteOptions = {}): Promise<void> {
        await this.repository.transaction(async (repository) => {
            const record = await this.lockCollection(repository, collection, options);

            if (!record) {
                return;
            }

            // one generation per round: a read of every other chunk would be unbounded
            for (;;) {
                const { data: [other] } = await repository.chunks.findMany(defineQuery({
                    fields: ['generation'],
                    filters: and(eq('collectionId', record.id), ne('generation', generation)),
                    pagination: { limit: 1 },
                }));

                if (!other) {
                    return;
                }

                await repository.chunks.removeManyBy({ collectionId: record.id, generation: other.generation });
            }
        });
    }

    async search(
        collection: string,
        generation: number,
        vector: number[],
        options: KnowledgeSearchOptions,
    ): Promise<KnowledgeMatch[]> {
        const record = await this.repository.findOneBy({ name: collection });

        if (!record) {
            return [];
        }

        const matches = await this.repository.chunks.search(record.id, generation, vector, options);

        return matches.map((match) => ({ collection, ...match }));
    }

    /** One attempt of `saveCollection`: the locked read by name, then an insert or a whole-row replace. */
    protected async saveCollectionOnce(
        collection: KnowledgeCollection,
        options: KnowledgeWriteOptions,
    ): Promise<KnowledgeCollectionRecord> {
        return this.repository.transaction(async (repository) => {
            const stored = await this.lockCollection(repository, collection.name, options);

            if (stored && options.create) {
                throw new LeaseLostError({ lock: lockKey(collection.name) });
            }

            // a record read earlier may carry a row id and a fence: neither is the caller's to write
            const fields = toCollection(collection as KnowledgeCollectionRecord);

            if (!stored) {
                return repository.save(repository.create({
                    ...fields,
                    id: uuidv7(),
                    fence: 0,
                }));
            }

            return repository.upsert({
                ...fields,
                id: stored.id,
                fence: stored.fence,
            });
        });
    }

    /**
     * The collection's row, locked for the transaction. With a fence, a
     * missing row is `RepositoryNotFoundError` and a row of another id or
     * fence `LeaseLostError` (the pass lost its lock; nothing is written).
     */
    protected async lockCollection(
        repository: IKnowledgeCollectionRepository,
        name: string,
        options: KnowledgeWriteOptions,
    ): Promise<KnowledgeCollectionRecord | undefined> {
        const record = await repository.findOneBy({ name }) ?? undefined;
        const { fence } = options;

        if (fence === undefined) {
            return record;
        }

        if (!record) {
            throw new RepositoryNotFoundError('knowledge collections');
        }

        if (record.id !== fence.id || record.fence !== fence.fence) {
            throw new LeaseLostError({ lock: lockKey(name) });
        }

        return record;
    }

    /** As `lockCollection`, a missing row being `RepositoryNotFoundError` also without a fence. */
    protected async lockCollectionOrFail(
        repository: IKnowledgeCollectionRepository,
        name: string,
        options: KnowledgeWriteOptions,
    ): Promise<KnowledgeCollectionRecord> {
        const record = await this.lockCollection(repository, name, options);

        if (!record) {
            throw new RepositoryNotFoundError('knowledge collections');
        }

        return record;
    }
}
