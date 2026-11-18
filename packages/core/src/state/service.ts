/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { and, defineQuery, eq } from '@rapiq/core';
import type { IQuery } from '@rapiq/core';
import { uuidv7 } from 'uuidv7';
import type { IStateDocumentRepository, IStateRepository } from '@chamvi/store';
import { RepositoryNotFoundError } from '../errors/index.ts';
import { readDocumentWhere, topLevelConditions } from './helpers.ts';
import type {
    IStateService,
    StateDocumentFindOptions,
    StateDocumentValue,
    StateEntryValue,
    StateFindOptions,
    StateServiceContext,
} from './types.ts';

/**
 * Per-agent state over an `IStateRepository` (keys) and an
 * `IStateDocumentRepository` (collection documents): a set of `undefined`
 * removes the key, keys list in code-point order, documents match by
 * top-level equality and list by document id.
 */
export class StateService implements IStateService {
    protected repository: IStateRepository;

    protected documentRepository: IStateDocumentRepository;

    constructor(ctx: StateServiceContext) {
        this.repository = ctx.repository;
        this.documentRepository = ctx.documentRepository;
    }

    async findOne(agent: string, key: string): Promise<unknown> {
        const entry = await this.repository.findOneBy({ agent, key });

        return entry ? entry.value : undefined;
    }

    async findOneOrFail(agent: string, key: string): Promise<unknown> {
        const value = await this.findOne(agent, key);

        if (value === undefined) {
            throw new RepositoryNotFoundError('state');
        }

        return value;
    }

    async set(agent: string, key: string, value: unknown): Promise<unknown> {
        if (value === undefined) {
            await this.repository.transaction(async (repository) => {
                const entry = await repository.findOneBy({ agent, key });

                if (entry) {
                    await repository.remove(entry);
                }
            });

            return undefined;
        }

        const stored = await this.repository.transaction((repository) => repository.upsert(repository.create({
            id: uuidv7(),
            agent,
            key,
            value,
        })));

        return stored.value;
    }

    async find(agent: string, options: StateFindOptions = {}): Promise<StateEntryValue[]> {
        if (options.limit === 0) {
            return [];
        }

        const { data } = await this.repository.findMany(defineQuery({
            filters: eq('agent', agent),
            sorts: { key: 'ASC' },
            pagination: {
                ...(options.limit !== undefined ? { limit: options.limit } : {}),
                ...(options.offset !== undefined ? { offset: options.offset } : {}),
            },
        }));

        return data.map((entry) => ({ key: entry.key, value: entry.value }));
    }

    async list(agent: string, query: IQuery): Promise<StateEntryValue[]> {
        if (query.pagination.limit === 0) {
            return [];
        }

        const sorts: Record<string, 'ASC' | 'DESC'> = {};

        for (const sort of query.sorts.value) {
            sorts[sort.name] = sort.operator;
        }

        const { data } = await this.repository.findMany(defineQuery({
            filters: and(eq('agent', agent), ...topLevelConditions(query.filters)),
            sorts: { ...sorts, ...(Object.hasOwn(sorts, 'key') ? {} : { key: 'ASC' as const }) },
            pagination: query.pagination,
        }));

        return data.map((entry) => ({ key: entry.key, value: entry.value }));
    }

    async findOrFail(agent: string, options: StateFindOptions = {}): Promise<StateEntryValue[]> {
        const entries = await this.find(agent, options);

        if (entries.length === 0) {
            throw new RepositoryNotFoundError('state');
        }

        return entries;
    }

    async findDocuments(agent: string, collection: string, options: StateDocumentFindOptions = {}): Promise<StateDocumentValue[]> {
        if (options.limit === 0) {
            return [];
        }

        const { data } = await this.documentRepository.findContaining(
            agent,
            collection,
            options.where ?? {},
            options.limit !== undefined ? { limit: options.limit } : {},
        );

        return data.map((document) => ({ id: document.documentId, doc: document.doc }));
    }

    async listDocuments(agent: string, collection: string, query: IQuery): Promise<StateDocumentValue[]> {
        const where = readDocumentWhere(query);
        const { limit, offset } = query.pagination;

        if (limit === 0) {
            return [];
        }

        const { data } = await this.documentRepository.findContaining(agent, collection, where, {
            ...(limit !== undefined ? { limit } : {}),
            ...(offset !== undefined ? { offset } : {}),
        });

        return data.map((document) => ({ id: document.documentId, doc: document.doc }));
    }

    async findDocumentsOrFail(agent: string, collection: string, options: StateDocumentFindOptions = {}): Promise<StateDocumentValue[]> {
        const documents = await this.findDocuments(agent, collection, options);

        if (documents.length === 0) {
            throw new RepositoryNotFoundError('documents');
        }

        return documents;
    }

    async upsertDocument(agent: string, collection: string, id: string, doc: unknown): Promise<StateDocumentValue> {
        const stored = await this.documentRepository.transaction((repository) => repository.upsert(repository.create({
            id: uuidv7(),
            agent,
            collection,
            documentId: id,
            doc: doc ?? null,
        })));

        return { id: stored.documentId, doc: stored.doc };
    }

    async deleteDocument(agent: string, collection: string, id: string): Promise<void> {
        await this.documentRepository.transaction(async (repository) => {
            const document = await repository.findOneBy({
                agent,
                collection,
                documentId: id,
            });

            if (document) {
                await repository.remove(document);
            }
        });
    }
}
