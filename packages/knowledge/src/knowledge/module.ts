/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import {
    InvalidRunStateError,
    RepositoryNotFoundError,
    ValidationError,
} from '@chamvi/core';
import { CHUNKER_VERSION } from '../chunk/constants.ts';
import { contentHash } from '../chunk/module.ts';
import { isCollectionName } from '../collection/helpers.ts';
import { KNOWLEDGE_LOCK_TTL_MS } from '../indexer/constants.ts';
import { isLeaseLost, sameDetails, sameOrigin } from '../indexer/helpers/index.ts';
import { managedDocumentProblem, needsReembed } from '../managed/helpers.ts';
import { copy, lockKey } from '../service/helpers/index.ts';
import { storedDocument } from '../source/helpers.ts';
import type { KnowledgeDocumentInput } from '../source/types.ts';
import type { KnowledgeCollection } from '../store/types.ts';
import { KnowledgeIndexing } from './indexing.ts';
import type { IKnowledge, KnowledgeDocumentPutResult, KnowledgeOptions } from './types.ts';

const NO_DEFAULT_MODEL = 'Managed collections need an embedding model: set KNOWLEDGE_MODEL or knowledgeModule({ embeddingModel }).';

class Knowledge extends KnowledgeIndexing implements IKnowledge {
    async createCollection(name: string): Promise<KnowledgeCollection> {
        if (!isCollectionName(name)) {
            throw new ValidationError('A knowledge collection name must match ^[a-z0-9]+(-[a-z0-9]+)*$ and be at most 64 characters.');
        }

        const model = this.defaultModel;

        if (model === undefined) {
            throw new InvalidRunStateError(NO_DEFAULT_MODEL);
        }

        if (this.collections.has(name)) {
            throw new InvalidRunStateError(`Knowledge collection "${name}" is declared by this app.`);
        }

        // its own owner: a loop of this instance holding the lock is never released here
        const key = lockKey(name);
        const owner = `${this.owner}:create:${randomUUID()}`;

        if (await this.locks.acquire(key, owner, KNOWLEDGE_LOCK_TTL_MS) === undefined) {
            throw new InvalidRunStateError(`Knowledge collection "${name}" is being indexed; it exists or is being created.`);
        }

        let record: KnowledgeCollection;

        const exists = () => new InvalidRunStateError(`Knowledge collection "${name}" exists.`);

        try {
            if (await this.service.findOneCollection(name)) {
                throw exists();
            }

            const now = new Date(this.clock.now());

            record = {
                name,
                kind: 'managed',
                trusted: false,
                generation: 1,
                model,
                chunker: CHUNKER_VERSION,
                status: 'ready',
                createdAt: now,
                updatedAt: now,
            };

            // insert only: a record another owner created after the check (a lease that ran out) is never replaced
            await this.service.saveCollection(record, { create: true }).catch((error: unknown) => {
                throw isLeaseLost(error) ? exists() : error;
            });
        } finally {
            await this.locks.release(key, owner);
        }

        this.startManaged(name);

        return copy(record);
    }

    async deleteCollection(name: string): Promise<boolean> {
        if (this.collections.has(name)) {
            throw new InvalidRunStateError(`Knowledge collection "${name}" is declared by this app; remove it from the code first.`);
        }

        const record = await this.service.findOneCollection(name);

        if (!record) {
            return false;
        }

        if (record.kind === 'declared' && record.status !== 'orphaned') {
            throw new InvalidRunStateError(`Knowledge collection "${name}" is declared; only managed and orphaned collections are deleted.`);
        }

        // this instance's pass writes nothing more; another replica's re-reads the record
        const loop = this.indexing?.managed.get(name);

        this.stopManaged(name);
        this.reembeds.delete(name);
        this.deletedDuringPoll?.add(name);

        const deleted = await this.service.deleteCollection(name);

        // its lock released, so the name can be created again at once (runCollection never rejects)
        await loop?.task;

        return deleted;
    }

    /** The managed record of `name`, else RepositoryNotFoundError (missing) or InvalidRunStateError. */
    protected async managedRecord(name: string): Promise<KnowledgeCollection> {
        const record = await this.service.findOneCollection(name);

        if (!record) {
            throw new RepositoryNotFoundError('knowledge collections');
        }

        if (record.kind !== 'managed') {
            throw new InvalidRunStateError(`Knowledge collection "${name}" is not managed; its documents come from its sources.`);
        }

        return record;
    }

    async putDocument(collection: string, request: KnowledgeDocumentInput): Promise<KnowledgeDocumentPutResult> {
        const problem = managedDocumentProblem(request);

        if (problem) {
            throw problem;
        }

        const input = storedDocument(request);

        await this.managedRecord(collection);

        const hash = contentHash(input.content);
        const details = {
            ...(input.title === undefined ? {} : { title: input.title }),
            ...(input.source === undefined ? {} : { source: input.source }),
            ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
        };
        let existing = await this.service.findOneDocument(collection, input.id);

        // a failed document is embedded again, also for the same content (the provider may accept it now)
        while (existing && existing.status !== 'failed' && existing.hash === hash) {
            if (sameDetails(existing, input)) {
                return { status: existing.status, changed: false };
            }

            // a pending document with a new title or source is stored pending again (its embed may be in flight)
            if (existing.status !== 'ready' && !sameOrigin(existing, input)) {
                break;
            }

            // the vectors hold: one versioned write of the details to the document and its chunks,
            // also checking the status read (a pending document failed meanwhile is requeued below)
            if (await this.service.updateDetails(collection, input.id, existing, details)) {
                return { status: existing.status, changed: true };
            }

            // another PUT or the pass wrote meanwhile: decide on what is stored now
            existing = await this.service.findOneDocument(collection, input.id);
        }

        await this.service.saveDocument({
            collection,
            id: input.id,
            content: input.content,
            hash,
            ...details,
            status: 'pending',
            // the chunks still served until the new content is embedded
            generation: existing?.generation ?? 0,
            updatedAt: new Date(this.clock.now()),
        });

        this.indexing?.managed.get(collection)?.wake.notify();

        return { status: 'pending', changed: true };
    }

    async deleteDocument(collection: string, id: string): Promise<boolean> {
        await this.managedRecord(collection);

        return this.service.deleteDocument(collection, id);
    }

    view(record: KnowledgeCollection): KnowledgeCollection {
        const view = copy(record);

        // content anyone with write access sent: never trusted, whatever was stored
        if (view.kind === 'managed') {
            view.trusted = false;
        }

        if (needsReembed(view, this.defaultModel)) {
            view.status = 'stale';
        }

        return view;
    }
}

/**
 * The declared collections over a knowledge repository. Every option is
 * checked here (InvalidAgentDefinitionError): duplicate names, a string
 * model without a resolver (or one that hands out no embedding model or
 * refuses the ref). `start()` indexes every declared collection in the
 * background (one loop each, under the store lock `knowledge:<name>`; it
 * passes again every `resyncMs` and on `sync(name)`) and
 * marks declared records without a definition orphaned; `stop()` aborts and
 * awaits both (a `start()` meanwhile begins once they settled). `check()` only reads: it runs every source's `check()` (a
 * missing folder) and refuses a declared name the store holds as a managed
 * collection.
 */
export function createKnowledge(options: KnowledgeOptions): IKnowledge {
    return new Knowledge(options);
}
