/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/*
 * Structural copies of `@chamvi/knowledge`'s service types: an import
 * would make the kit depend on `@chamvi/knowledge`, which depends on the kit
 * for its tests, a cycle in the graph release-please builds. Every
 * `KnowledgeService` is a `ContractKnowledgeService`.
 */

export type ContractKnowledgeTarget = {
    generation: number;
    model: string;
    dimensions?: number;
    chunker: string;
};

export type ContractKnowledgeCollection = {
    name: string;
    kind: 'declared' | 'managed';
    trusted: boolean;
    generation: number;
    model: string;
    dimensions?: number;
    chunker: string;
    pending?: ContractKnowledgeTarget;
    lastGeneration?: number;
    status: 'pending' | 'ready' | 'stale' | 'orphaned';
    error?: string;
    failures?: number;
    retryAt?: Date;
    syncedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
};

export type ContractKnowledgeDocumentStatus = 'pending' | 'ready' | 'failed';

export type ContractKnowledgeDocument = {
    collection: string;
    id: string;
    content: string;
    hash: string;
    title?: string;
    source?: string;
    metadata?: Record<string, unknown>;
    status: ContractKnowledgeDocumentStatus;
    error?: string;
    generation: number;
    updatedAt: Date;
};

export type ContractKnowledgeChunk = {
    index: number;
    text: string;
    start: number;
    end: number;
    vector: number[];
    title?: string;
    source?: string;
};

export type ContractKnowledgeMatch = {
    collection: string;
    document: string;
    index: number;
    text: string;
    score: number;
    title?: string;
    source?: string;
};

/** A stored collection: the collection with its row id (a uuid v7, given at creation) and its fence counter. */
export type ContractKnowledgeCollectionRecord = ContractKnowledgeCollection & {
    id: string;
    fence: number;
};

/** A pass's fence token: the collection row's id and its fence counter. */
export type ContractKnowledgeFence = {
    id: string;
    fence: number;
};

export type ContractKnowledgeWriteOptions = {
    fence?: ContractKnowledgeFence;
    /** `saveCollection` only: insert, never replace. */
    create?: boolean;
};

export type ContractKnowledgeService = {
    saveCollection(
        collection: ContractKnowledgeCollection,
        options?: ContractKnowledgeWriteOptions,
    ): Promise<ContractKnowledgeCollectionRecord>;
    claimFence(name: string, token: number): Promise<ContractKnowledgeFence | undefined>;
    findOneCollection(name: string): Promise<ContractKnowledgeCollection | undefined>;
    findOneCollectionOrFail(name: string): Promise<ContractKnowledgeCollection>;
    findCollections(): Promise<ContractKnowledgeCollection[]>;
    deleteCollection(name: string): Promise<boolean>;
    saveDocument(document: ContractKnowledgeDocument, options?: ContractKnowledgeWriteOptions): Promise<void>;
    findOneDocument(collection: string, id: string): Promise<ContractKnowledgeDocument | undefined>;
    findOneDocumentOrFail(collection: string, id: string): Promise<ContractKnowledgeDocument>;
    findDocumentIds(collection: string): Promise<string[]>;
    findDocuments(
        collection: string,
        options?: {
            status?: ContractKnowledgeDocumentStatus; 
            limit?: number; 
            offset?: number 
        },
    ): Promise<{ data: ContractKnowledgeDocument[]; total: number }>;
    updateDocument(
        collection: string,
        id: string,
        version: {
            hash: string; 
            title?: string; 
            source?: string 
        },
        patch: {
            status: ContractKnowledgeDocumentStatus; 
            error?: string; 
            generation?: number 
        },
        options?: ContractKnowledgeWriteOptions,
    ): Promise<boolean>;
    updateDetails(
        collection: string,
        id: string,
        version: {
            hash: string;
            title?: string;
            source?: string;
            status?: ContractKnowledgeDocumentStatus
        },
        details: {
            title?: string;
            source?: string;
            metadata?: Record<string, unknown>
        },
    ): Promise<boolean>;
    requeueGeneration(
        collection: string,
        generation: number,
        target: number,
        limit: number,
        options?: ContractKnowledgeWriteOptions,
    ): Promise<number>;
    deleteDocument(collection: string, id: string, options?: ContractKnowledgeWriteOptions): Promise<boolean>;
    replaceChunks(
        collection: string,
        document: string,
        generation: number,
        chunks: ContractKnowledgeChunk[],
        options?: ContractKnowledgeWriteOptions,
    ): Promise<void>;
    deleteGeneration(collection: string, generation: number, options?: ContractKnowledgeWriteOptions): Promise<void>;
    deleteGenerationsExcept(collection: string, generation: number, options?: ContractKnowledgeWriteOptions): Promise<void>;
    search(
        collection: string,
        generation: number,
        vector: number[],
        options: { topK: number; minScore?: number },
    ): Promise<ContractKnowledgeMatch[]>;
};

/** A service over fresh, empty repositories per call. */
export type KnowledgeRepositoryContractFactory = () => ContractKnowledgeService | Promise<ContractKnowledgeService>;

export type KnowledgeRepositoryContractOptions = {
    /** Label of the suite, e.g. the backend. */
    name: string;
    create: KnowledgeRepositoryContractFactory;
};
