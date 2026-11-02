/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { RepositoryNotFoundError } from '@chamvi/core';
import { compareCodePoints, copy, cosineSimilarity } from './helpers.ts';
import type {
    IKnowledgeRepository,
    KnowledgeChunkInput,
    KnowledgeCollection,
    KnowledgeDocument,
    KnowledgeDocumentFindOptions,
    KnowledgeDocumentPage,
    KnowledgeDocumentPatch,
    KnowledgeDocumentVersion,
    KnowledgeMatch,
    KnowledgeSearchOptions,
} from './types.ts';

/** Chunks of one collection: document id, then generation. */
type ChunkIndex = Map<string, Map<number, KnowledgeChunkInput[]>>;

/**
 * An in-process `IKnowledgeRepository`: structured clones in and out, no
 * await between a check and its write, and an exhaustive cosine scan per
 * search. Nothing survives the process, so every restart re-embeds.
 */
export class MemoryKnowledgeRepository implements IKnowledgeRepository {
    protected collections = new Map<string, KnowledgeCollection>();

    protected documents = new Map<string, Map<string, KnowledgeDocument>>();

    protected chunks = new Map<string, ChunkIndex>();

    async saveCollection(collection: KnowledgeCollection): Promise<void> {
        this.collections.set(collection.name, copy(collection));
    }

    async findOneCollection(name: string): Promise<KnowledgeCollection | undefined> {
        const collection = this.collections.get(name);

        return collection ? copy(collection) : undefined;
    }

    async findOneCollectionOrFail(name: string): Promise<KnowledgeCollection> {
        const collection = await this.findOneCollection(name);

        if (!collection) {
            throw new RepositoryNotFoundError('knowledge collections');
        }

        return collection;
    }

    async findCollections(): Promise<KnowledgeCollection[]> {
        return this.collections.values().toArray()
            .sort((a, b) => compareCodePoints(a.name, b.name))
            .map((collection) => copy(collection));
    }

    async deleteCollection(name: string): Promise<boolean> {
        this.documents.delete(name);
        this.chunks.delete(name);

        return this.collections.delete(name);
    }

    async saveDocument(document: KnowledgeDocument): Promise<void> {
        this.assertCollection(document.collection);

        let documents = this.documents.get(document.collection);

        if (!documents) {
            documents = new Map();
            this.documents.set(document.collection, documents);
        }

        documents.set(document.id, copy(document));
    }

    async findOneDocument(collection: string, id: string): Promise<KnowledgeDocument | undefined> {
        const document = this.documents.get(collection)?.get(id);

        return document ? copy(document) : undefined;
    }

    async findOneDocumentOrFail(collection: string, id: string): Promise<KnowledgeDocument> {
        const document = await this.findOneDocument(collection, id);

        if (!document) {
            throw new RepositoryNotFoundError('knowledge documents');
        }

        return document;
    }

    async findDocumentIds(collection: string): Promise<string[]> {
        const documents = this.documents.get(collection);

        if (!documents) {
            return [];
        }

        return documents.keys().toArray().sort(compareCodePoints);
    }

    async findDocuments(collection: string, options: KnowledgeDocumentFindOptions = {}): Promise<KnowledgeDocumentPage> {
        const matches = (this.documents.get(collection)?.values().toArray() ?? [])
            .filter((document) => options.status === undefined || document.status === options.status)
            .sort((a, b) => compareCodePoints(a.id, b.id));
        const offset = Math.max(0, options.offset ?? 0);
        const end = options.limit === undefined ? undefined : offset + Math.max(0, options.limit);

        return {
            data: matches.slice(offset, end).map((document) => copy(document)),
            total: matches.length,
        };
    }

    async updateDocument(
        collection: string,
        id: string,
        version: KnowledgeDocumentVersion,
        patch: KnowledgeDocumentPatch,
    ): Promise<boolean> {
        const documents = this.documents.get(collection);
        const document = documents?.get(id);

        if (
            !documents ||
            !document ||
            document.hash !== version.hash ||
            document.title !== version.title ||
            document.source !== version.source
        ) {
            return false;
        }

        const updated: KnowledgeDocument = {
            ...document,
            status: patch.status,
            ...(patch.generation === undefined ? {} : { generation: patch.generation }),
        };

        delete updated.error;

        if (patch.error !== undefined) {
            updated.error = patch.error;
        }

        documents.set(id, copy(updated));

        return true;
    }

    async deleteDocument(collection: string, id: string): Promise<boolean> {
        this.chunks.get(collection)?.delete(id);

        return this.documents.get(collection)?.delete(id) ?? false;
    }

    async replaceChunks(
        collection: string,
        document: string,
        generation: number,
        chunks: KnowledgeChunkInput[],
    ): Promise<void> {
        this.assertCollection(collection);

        let index = this.chunks.get(collection);

        if (!index) {
            index = new Map();
            this.chunks.set(collection, index);
        }

        let generations = index.get(document);

        if (!generations) {
            generations = new Map();
            index.set(document, generations);
        }

        if (chunks.length === 0) {
            generations.delete(generation);
        } else {
            generations.set(generation, copy(chunks));
        }
    }

    async deleteGeneration(collection: string, generation: number): Promise<void> {
        for (const generations of this.chunks.get(collection)?.values() ?? []) {
            generations.delete(generation);
        }
    }

    async deleteGenerationsExcept(collection: string, generation: number): Promise<void> {
        for (const generations of this.chunks.get(collection)?.values() ?? []) {
            for (const stored of generations.keys().toArray()) {
                if (stored !== generation) {
                    generations.delete(stored);
                }
            }
        }
    }

    async search(
        collection: string,
        generation: number,
        vector: number[],
        options: KnowledgeSearchOptions,
    ): Promise<KnowledgeMatch[]> {
        const index = this.chunks.get(collection);

        if (!index) {
            return [];
        }

        const matches: KnowledgeMatch[] = [];

        for (const [document, generations] of index) {
            for (const chunk of generations.get(generation) ?? []) {
                const score = cosineSimilarity(vector, chunk.vector);

                if (score === undefined || (options.minScore !== undefined && score < options.minScore)) {
                    continue;
                }

                matches.push({
                    collection,
                    document,
                    index: chunk.index,
                    text: chunk.text,
                    score,
                    ...(chunk.title === undefined ? {} : { title: chunk.title }),
                    ...(chunk.source === undefined ? {} : { source: chunk.source }),
                });
            }
        }

        return matches
            .sort((a, b) => (b.score - a.score) ||
                compareCodePoints(a.document, b.document) ||
                (a.index - b.index))
            .slice(0, Math.max(0, options.topK));
    }

    protected assertCollection(name: string): void {
        if (!this.collections.has(name)) {
            throw new RepositoryNotFoundError('knowledge collections');
        }
    }
}

/** A fresh, empty in-memory knowledge repository. */
export function createMemoryKnowledgeRepository(): MemoryKnowledgeRepository {
    return new MemoryKnowledgeRepository();
}
