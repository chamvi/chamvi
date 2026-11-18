/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '@chamvi/core';
import { RepositoryNotFoundError } from '@chamvi/core';
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
    KnowledgeDocumentFindOptions,
    KnowledgeDocumentPage,
    KnowledgeDocumentPatch,
    KnowledgeDocumentRecord,
    KnowledgeDocumentVersion,
    KnowledgeMatch,
    KnowledgeSearchOptions,
} from '../store/types.ts';
import { documentFieldsOf, toCollection, toDocument } from './helpers.ts';
import type { IKnowledgeService, KnowledgeServiceContext } from './types.ts';

/**
 * Knowledge storage over an `IKnowledgeCollectionRepository`, holding every
 * rule: the repositories store and read only.
 *
 * A write runs in one transaction whose first read is the collection row by
 * name (locked), then the documents and chunks through the handed-in
 * repository's children. Reads resolve the collection's row id first.
 * `saveCollection` keeps the stored row's `id` and `fence`; a new row gets
 * a uuid v7 id and fence 0.
 */
export class KnowledgeService implements IKnowledgeService {
    protected repository: IKnowledgeCollectionRepository;

    protected clock: IClock;

    constructor(ctx: KnowledgeServiceContext) {
        this.repository = ctx.repository;
        this.clock = ctx.clock;
    }

    async saveCollection(collection: KnowledgeCollection): Promise<KnowledgeCollectionRecord> {
        try {
            return await this.saveCollectionOnce(collection);
        } catch (error) {
            if (!(error instanceof EntityConflictError)) {
                throw error;
            }

            // another insert of the name landed between the locked read and the insert: in place, in a new transaction
            return this.saveCollectionOnce(collection);
        }
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

    async saveDocument(document: KnowledgeDocument): Promise<void> {
        await this.repository.transaction(async (repository) => {
            const record = await this.lockCollectionOrFail(repository, document.collection);
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
    ): Promise<boolean> {
        return this.repository.transaction(async (repository) => {
            const record = await repository.findOneBy({ name: collection });

            if (!record) {
                return false;
            }

            const document = await repository.documents.findOneBy({ collectionId: record.id, id });

            if (
                !document ||
                document.hash !== version.hash ||
                document.title !== version.title ||
                document.source !== version.source
            ) {
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

    async deleteDocument(collection: string, id: string): Promise<boolean> {
        return this.repository.transaction(async (repository) => {
            const record = await repository.findOneBy({ name: collection });

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
    ): Promise<void> {
        await this.repository.transaction(async (repository) => {
            const record = await this.lockCollectionOrFail(repository, collection);
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

    async deleteGeneration(collection: string, generation: number): Promise<void> {
        await this.repository.transaction(async (repository) => {
            const record = await repository.findOneBy({ name: collection });

            if (record) {
                await repository.chunks.removeManyBy({ collectionId: record.id, generation });
            }
        });
    }

    async deleteGenerationsExcept(collection: string, generation: number): Promise<void> {
        await this.repository.transaction(async (repository) => {
            const record = await repository.findOneBy({ name: collection });

            if (!record) {
                return;
            }

            const { data } = await repository.chunks.findMany(defineQuery({
                fields: ['generation'],
                filters: and(eq('collectionId', record.id), ne('generation', generation)),
            }));
            const others = [...new Set(data.map((chunk) => chunk.generation))];

            if (others.length > 0) {
                await repository.chunks.removeManyBy({ collectionId: record.id, generation: others });
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
    protected async saveCollectionOnce(collection: KnowledgeCollection): Promise<KnowledgeCollectionRecord> {
        return this.repository.transaction(async (repository) => {
            const stored = await repository.findOneBy({ name: collection.name });
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

    /** The collection's row, locked for the transaction; a missing one is `RepositoryNotFoundError`. */
    protected async lockCollectionOrFail(
        repository: IKnowledgeCollectionRepository,
        name: string,
    ): Promise<KnowledgeCollectionRecord> {
        const record = await repository.findOneBy({ name });

        if (!record) {
            throw new RepositoryNotFoundError('knowledge collections');
        }

        return record;
    }
}
