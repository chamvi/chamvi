/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TypedToken } from '@chamvi/app';
import * as knowledge from '@chamvi/knowledge';
import * as knowledgeModuleEntry from '@chamvi/knowledge/module';

describe('public api', () => {
    it('exports the memory repositories and the service', () => {
        const repository = knowledge.createMemoryKnowledgeRepository();

        expect(repository).toBeInstanceOf(knowledge.MemoryKnowledgeCollectionRepository);
        expect(repository.documents).toBeInstanceOf(knowledge.MemoryKnowledgeDocumentRepository);
        expect(repository.chunks).toBeInstanceOf(knowledge.MemoryKnowledgeChunkRepository);
        expect(knowledge.KnowledgeService).toBeTypeOf('function');
    });

    it('exports the chunker, sources, collections and createKnowledge', () => {
        expect(knowledge.chunkText).toBeTypeOf('function');
        expect(knowledge.contentHash).toBeTypeOf('function');
        expect(knowledge.defineKnowledgeSource).toBeTypeOf('function');
        expect(knowledge.folder).toBeTypeOf('function');
        expect(knowledge.knowledgeCollection).toBeTypeOf('function');
        expect(knowledge.createKnowledge).toBeTypeOf('function');
    });

    it('exports the indexer constants', () => {
        expect(knowledge.KNOWLEDGE_LOCK_TTL_MS).toBe(300_000);
        expect(knowledge.KNOWLEDGE_RETRY_MS).toBe(5_000);
        expect(knowledge.KNOWLEDGE_RESYNC_MIN_MS).toBe(60_000);
        expect(knowledge.KNOWLEDGE_RETRY_MAX_MS).toBe(300_000);
        expect(knowledge.KNOWLEDGE_EMBED_TIMEOUT_MS).toBe(60_000);
        expect(knowledge.KNOWLEDGE_REQUEST_ERROR_CODE).toBe('knowledge_request');
        expect(knowledge.EMBED_BATCH_SIZE).toBe(64);
    });

    it('exports the managed collection limits', () => {
        expect(knowledge.MANAGED_CONTENT_MAX_CHARS).toBe(1_048_576);
        expect(knowledge.KNOWLEDGE_MANAGED_POLL_MS).toBe(60_000);
        expect(knowledge.KNOWLEDGE_MANAGED_COMPONENT_NAME).toBe('knowledge-managed');
    });

    it('exports the knowledge tools, their limits and the context pair', () => {
        expect(knowledge.knowledgeTools).toBeTypeOf('function');
        expect(knowledge.provideKnowledgeContext).toBeTypeOf('function');
        expect(knowledge.injectKnowledgeContext).toBeTypeOf('function');
        expect(knowledge.KNOWLEDGE_SEARCH_DEFAULT_RESULTS).toBe(5);
        expect(knowledge.KNOWLEDGE_SEARCH_MAX_RESULTS).toBe(20);
        expect(knowledge.KNOWLEDGE_SEARCH_MAX_CHARS).toBe(20_000);
        expect(knowledge.KNOWLEDGE_QUERY_MAX_LENGTH).toBe(1000);
    });

    it('exports the REST routes, their path, permissions and page limits', () => {
        expect(knowledge.knowledgeRoutes).toBeTypeOf('function');
        expect(knowledge.KNOWLEDGE_ROUTE_PATH).toBe('/knowledge');
        expect(knowledge.KNOWLEDGE_READ_PERMISSION).toBe('chamvi_knowledge_read');
        expect(knowledge.KNOWLEDGE_WRITE_PERMISSION).toBe('chamvi_knowledge_write');
        expect(knowledge.KNOWLEDGE_DOCUMENTS_DEFAULT_LIMIT).toBe(50);
        expect(knowledge.KNOWLEDGE_DOCUMENTS_MAX_LIMIT).toBe(100);
        expect(knowledge.KNOWLEDGE_COLLECTION_ENTITY).toBe('knowledge_collection');
        expect(knowledge.KNOWLEDGE_DOCUMENT_ENTITY).toBe('knowledge_document');
        expect(knowledge.KNOWLEDGE_CHUNK_ENTITY).toBe('knowledge_chunk');
    });

    it('keeps the internals internal', () => {
        expect(Object.keys(knowledge).sort()).toEqual([
            'CHUNKER_VERSION',
            'CHUNK_MAX_CHARS',
            'CHUNK_OVERLAP_CHARS',
            'EMBED_BATCH_SIZE',
            'FOLDER_EXTENSIONS',
            'FOLDER_FILE_MAX_BYTES',
            'KNOWLEDGE_CHUNK_ENTITY',
            'KNOWLEDGE_COLLECTION_ENTITY',
            'KNOWLEDGE_DOCUMENTS_DEFAULT_LIMIT',
            'KNOWLEDGE_DOCUMENTS_MAX_LIMIT',
            'KNOWLEDGE_DOCUMENT_ENTITY',
            'KNOWLEDGE_DOCUMENT_ID_MAX_LENGTH',
            'KNOWLEDGE_EMBED_TIMEOUT_MS',
            'KNOWLEDGE_LOCK_TTL_MS',
            'KNOWLEDGE_MANAGED_COMPONENT_NAME',
            'KNOWLEDGE_MANAGED_POLL_MS',
            'KNOWLEDGE_QUERY_MAX_LENGTH',
            'KNOWLEDGE_READ_PERMISSION',
            'KNOWLEDGE_REQUEST_ERROR_CODE',
            'KNOWLEDGE_RESYNC_MIN_MS',
            'KNOWLEDGE_RETRY_MAX_MS',
            'KNOWLEDGE_RETRY_MS',
            'KNOWLEDGE_ROUTE_PATH',
            'KNOWLEDGE_SEARCH_DEFAULT_RESULTS',
            'KNOWLEDGE_SEARCH_MAX_CHARS',
            'KNOWLEDGE_SEARCH_MAX_RESULTS',
            'KNOWLEDGE_WRITE_PERMISSION',
            'KnowledgeService',
            'MANAGED_CONTENT_MAX_CHARS',
            'MemoryKnowledgeChunkRepository',
            'MemoryKnowledgeCollectionRepository',
            'MemoryKnowledgeDocumentRepository',
            'chunkText',
            'contentHash',
            'createKnowledge',
            'createMemoryKnowledgeRepository',
            'defineKnowledgeSource',
            'folder',
            'injectKnowledgeContext',
            'knowledgeCollection',
            'knowledgeRoutes',
            'knowledgeTools',
            'provideKnowledgeContext',
        ]);
    });

    it('exports knowledgeModule from /module', () => {
        expect(Object.keys(knowledgeModuleEntry).sort()).toEqual([
            'KNOWLEDGE_MODEL_VARIABLE',
            'KNOWLEDGE_MODULE_NAME',
            'KNOWLEDGE_REPOSITORY_MODULE_NAME',
            'KnowledgeModule',
            'KnowledgeToken',
            'knowledgeModule',
        ]);
        expect(knowledgeModuleEntry.knowledgeModule).toBeTypeOf('function');
        expect(knowledgeModuleEntry.KnowledgeModule).toBeTypeOf('function');
        expect(knowledgeModuleEntry.KNOWLEDGE_MODULE_NAME).toBe('chamvi:knowledge');
        expect(knowledgeModuleEntry.KNOWLEDGE_MODEL_VARIABLE).toBe('CHAMVI_KNOWLEDGE_MODEL');
        expect(knowledgeModuleEntry.KNOWLEDGE_REPOSITORY_MODULE_NAME).toBe('chamvi:knowledge-repository');
        expect(knowledgeModuleEntry.KnowledgeToken.REPOSITORY.name).toBe('chamvi.knowledge-repository');
    });

    it('creates its token with app\'s TypedToken and depends on no eldin of its own', () => {
        const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as Record<string, Record<string, string> | undefined>;

        expect(knowledgeModuleEntry.KnowledgeToken.REPOSITORY).toBeInstanceOf(TypedToken);

        for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
            expect(pkg[field]?.eldin, field).toBeUndefined();
        }
    });
});
