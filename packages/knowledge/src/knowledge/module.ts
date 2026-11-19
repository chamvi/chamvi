/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import type { IClock, ILockService, IModelResolver } from '@chamvi/core';
import {
    ChamviError,
    InvalidAgentDefinitionError,
    InvalidRunStateError,
    RepositoryNotFoundError,
    ValidationError,
} from '@chamvi/core';
import type { EmbeddingModel } from 'ai';
import { embedMany } from 'ai';
import { defineIntervalComponent } from 'hubwire';
import type { IComponent } from 'hubwire';
import { CHUNKER_VERSION } from '../chunk/constants.ts';
import { contentHash } from '../chunk/module.ts';
import { isCollectionName, isEmbeddingModelObject, managedNameError } from '../collection/helpers.ts';
import type { ResolvedKnowledgeCollection } from '../collection/types.ts';
import {
    KNOWLEDGE_EMBED_TIMEOUT_MS,
    KNOWLEDGE_LOCK_TTL_MS,
    KNOWLEDGE_REQUEST_ERROR_CODE,
} from '../indexer/constants.ts';
import {
    createWake,
    isLeaseLost,
    messageOf,
    sameDetails,
    sameOrigin,
} from '../indexer/helpers.ts';
import { markOrphans, runCollection, syncCollection } from '../indexer/module.ts';
import type { KnowledgeIndexLock, KnowledgeWake } from '../indexer/types.ts';
import { KNOWLEDGE_MANAGED_COMPONENT_NAME, KNOWLEDGE_MANAGED_POLL_MS } from '../managed/constants.ts';
import { managedDocumentProblem, needsReembed } from '../managed/helpers.ts';
import { syncManaged } from '../managed/module.ts';
import type { ManagedLoop } from '../managed/types.ts';
import { copy, lockKey } from '../service/helpers.ts';
import type { IKnowledgeService } from '../service/types.ts';
import type { KnowledgeDocumentInput } from '../source/types.ts';
import type { IKnowledgeCollectionRepository, KnowledgeCollection } from '../store/types.ts';
import { normalizeOptions, resolveCollection, resolveEmbeddingModel } from './helpers.ts';
import type {
    IKnowledge,
    KnowledgeDocumentPutResult,
    KnowledgeErrorContext,
    KnowledgeOptions,
} from './types.ts';

const NO_DEFAULT_MODEL = 'Managed collections need an embedding model: set CHAMVI_KNOWLEDGE_MODEL or knowledgeModule({ embeddingModel }).';

class Knowledge implements IKnowledge {
    readonly repository: IKnowledgeCollectionRepository;

    readonly service: IKnowledgeService;

    protected readonly locks: Pick<ILockService, 'acquire' | 'release'>;

    protected readonly models: IModelResolver | undefined;

    protected readonly clock: IClock;

    protected readonly owner: string;

    protected readonly onError: (error: unknown, context: KnowledgeErrorContext) => void;

    readonly managedPoll: IComponent;

    /** Whether `start()`/`stop()` run `managedPoll` (false when its owner runs it). */
    protected readonly runManagedPoll: boolean;

    /** The declared collections by name, in declaration order. */
    protected readonly collections = new Map<string, ResolvedKnowledgeCollection>();

    /** The embedding models by stored identity (the first collection's for a shared one). */
    protected readonly embeddings = new Map<string, EmbeddingModel>();

    /** The stored identity of the managed collections' model, when one is configured. */
    protected readonly defaultModel: string | undefined;

    /** Managed collections whose next pass re-embeds a stale record (asked by `sync()`). */
    protected readonly reembeds = new Set<string>();

    /** Managed collections deleted here while a poll reads the list (its snapshot still holds them). */
    protected deletedDuringPoll: Set<string> | undefined;

    /**
     * The indexing in flight: its abort, its tasks (one loop per collection,
     * the orphan pass), the wake of each declared
     * collection's loop and the managed loops.
     */
    protected indexing: {
        controller: AbortController;
        tasks: Promise<void>[];
        wakes: Map<string, KnowledgeWake>;
        managed: Map<string, ManagedLoop>;
    } | undefined;

    /** The stop still waiting for its tasks; a start() meanwhile waits for it. */
    protected stopping: Promise<void> | undefined;

    /** Whether a start() waits for `stopping`. */
    protected restart = false;

    constructor(options: KnowledgeOptions) {
        const normalized = normalizeOptions(options);

        this.repository = normalized.repository;
        this.service = normalized.service;
        this.locks = normalized.locks;
        this.models = normalized.models;
        this.clock = normalized.clock;
        this.owner = normalized.owner;
        this.onError = normalized.onError;
        this.runManagedPoll = normalized.runManagedPoll;
        this.managedPoll = defineIntervalComponent({
            name: KNOWLEDGE_MANAGED_COMPONENT_NAME,
            intervalMs: KNOWLEDGE_MANAGED_POLL_MS,
            runOnStart: true,
            clock: this.clock,
            // as every chamvi timer: an idle poll never holds the process
            unref: true,
            handler: ({ signal }) => this.pollManaged(signal),
            hooks: { onError: (error) => this.onError(error, {}) },
        });

        for (const definition of normalized.collections) {
            const resolved = resolveCollection(definition, this.models);

            if (this.collections.has(resolved.name)) {
                throw new InvalidAgentDefinitionError(`Knowledge collection "${resolved.name}" is declared twice.`);
            }

            this.collections.set(resolved.name, resolved);

            if (!this.embeddings.has(resolved.model)) {
                this.embeddings.set(resolved.model, resolved.embedding);
            }
        }

        if (normalized.embeddingModel === undefined) {
            return;
        }

        const resolved = resolveEmbeddingModel(normalized.embeddingModel, this.models, 'createKnowledge() embeddingModel');

        this.defaultModel = resolved.model;

        if (!this.embeddings.has(resolved.model)) {
            this.embeddings.set(resolved.model, resolved.embedding);
        }
    }

    collection(name: string): ResolvedKnowledgeCollection | undefined {
        return this.collections.get(name);
    }

    embedding(model: string): EmbeddingModel {
        const known = this.embeddings.get(model);

        if (known) {
            return known;
        }

        if (typeof this.models?.embedding === 'function') {
            const resolved = this.models.embedding(model);

            if (isEmbeddingModelObject(resolved)) {
                return resolved;
            }
        }

        throw new InvalidAgentDefinitionError(`Knowledge has no embedding model "${model}".`);
    }

    start(): void {
        if (this.indexing || this.restart) {
            return;
        }

        const { stopping } = this;

        if (stopping) {
            // a restart waits for the loops still stopping, so two task sets never overlap
            this.restart = true;
            stopping.then(() => {
                if (!this.restart) {
                    return;
                }

                this.restart = false;
                this.begin();
            }, () => {});

            return;
        }

        this.begin();
    }

    protected begin(): void {
        if (this.indexing) {
            return;
        }

        const controller = new AbortController();
        const { signal } = controller;
        const wakes = new Map<string, KnowledgeWake>();
        const embed = (model: string, texts: string[], abortSignal: AbortSignal) => this.embed(model, texts, abortSignal);
        const managed = new Map<string, ManagedLoop>();
        const tasks = [
            markOrphans(this.service, new Set(this.collections.keys()), this.locks, this.owner, this.clock)
                .catch((error: unknown) => this.onError(error, {})),
            ...this.collections.values().map((definition) => {
                const wake = createWake();

                wakes.set(definition.name, wake);

                const task = runCollection({
                    name: definition.name,
                    service: this.service,
                    locks: this.locks,
                    owner: this.owner,
                    clock: this.clock,
                    signal,
                    onError: this.onError,
                    wake,
                    ...(definition.resyncMs === undefined ? {} : { idleMs: definition.resyncMs }),
                    // a record deleted on another replica (#120) is rebuilt without a resync or a restart
                    checkMs: KNOWLEDGE_MANAGED_POLL_MS,
                    pass: (lock, report) => syncCollection({
                        definition,
                        service: this.service,
                        embed,
                        clock: this.clock,
                        signal,
                        lock,
                        onError: report,
                    }),
                });

                // a loop ended by a configuration error takes no sync(): it would answer for nothing
                return task.then(() => {
                    if (wakes.get(definition.name) === wake) {
                        wakes.delete(definition.name);
                    }
                });
            }),
        ];

        this.indexing = {
            controller,
            tasks,
            wakes,
            managed,
        };

        if (this.runManagedPoll) {
            // its first pass runs at once; it never rejects (a failed pass goes to onError)
            this.managedPoll.start().catch(() => {});
        }
    }

    /**
     * One pass of `managedPoll` (at once, then every
     * KNOWLEDGE_MANAGED_POLL_MS): starts a loop per managed record without
     * one (created here before the start, or by another instance) and stops
     * the loops whose record is gone or no longer managed. A failed read is
     * reported and tried at the next poll; a pass stopped meanwhile (the
     * component's or the indexing's stop) reports nothing.
     */
    protected async pollManaged(signal: AbortSignal): Promise<void> {
        const { indexing } = this;

        // nothing indexes: no loop to start or stop (a component started before or after start())
        if (!indexing) {
            return;
        }

        const stopped = AbortSignal.any([signal, indexing.controller.signal]);

        try {
            await this.reconcileManaged(indexing, stopped);
        } catch (error) {
            if (!stopped.aborted) {
                throw error;
            }
        }
    }

    protected async reconcileManaged(indexing: NonNullable<Knowledge['indexing']>, signal: AbortSignal): Promise<void> {
        // a loop started while the list is read (createCollection, also after a delete) is no stale one
        const before = new Map(indexing.managed);
        const deleted = new Set<string>();
        let records: KnowledgeCollection[];

        this.deletedDuringPoll = deleted;

        try {
            records = await this.service.findCollections();
        } finally {
            this.deletedDuringPoll = undefined;
        }

        if (signal.aborted) {
            return;
        }

        const names = new Set(records
            .filter((record) => record.kind === 'managed' && !this.collections.has(record.name) && !deleted.has(record.name))
            .map((record) => record.name));

        for (const name of names) {
            this.startManaged(name);
        }

        for (const [name, loop] of before) {
            if (!names.has(name) && indexing.managed.get(name) === loop) {
                this.stopManaged(name);
            }
        }
    }

    /** Starts the loop of a managed collection, unless one runs or indexing is off. */
    protected startManaged(name: string): void {
        const { indexing } = this;

        if (!indexing || indexing.controller.signal.aborted || indexing.managed.has(name) || this.collections.has(name)) {
            return;
        }

        const controller = new AbortController();
        const signal = AbortSignal.any([indexing.controller.signal, controller.signal]);
        const wake = createWake();
        const task = runCollection({
            name,
            service: this.service,
            locks: this.locks,
            owner: this.owner,
            clock: this.clock,
            signal,
            onError: this.onError,
            wake,
            idleMs: KNOWLEDGE_MANAGED_POLL_MS,
            pass: (lock, report) => this.passManaged(name, signal, lock, report),
        });
        const loop: ManagedLoop = {
            controller,
            wake,
            task,
        };

        indexing.managed.set(name, loop);
        indexing.tasks.push(task);

        // a loop that ended (aborted, or a configuration error) is started again by the next poll
        task.then(() => {
            if (indexing.managed.get(name) === loop) {
                indexing.managed.delete(name);
            }

            const index = indexing.tasks.indexOf(task);

            if (index !== -1 && this.indexing === indexing) {
                indexing.tasks.splice(index, 1);
            }
        }, () => {});
    }

    protected stopManaged(name: string): void {
        const loop = this.indexing?.managed.get(name);

        if (!loop) {
            return;
        }

        this.indexing!.managed.delete(name);
        loop.controller.abort();
    }

    protected async passManaged(
        name: string,
        signal: AbortSignal,
        lock: KnowledgeIndexLock,
        report: (error: unknown) => void,
    ): Promise<void> {
        const reembed = this.reembeds.delete(name);

        try {
            await syncManaged({
                name,
                service: this.service,
                embed: (model, texts, abortSignal) => this.embed(model, texts, abortSignal),
                hasModel: (model) => this.hasEmbedding(model),
                ...(this.defaultModel === undefined ? {} : { model: this.defaultModel }),
                reembed,
                clock: this.clock,
                signal,
                lock,
                onError: report,
            });
        } catch (error) {
            // asked for again: the retry re-embeds
            if (reembed) {
                this.reembeds.add(name);
            }

            throw error;
        }
    }

    protected hasEmbedding(model: string): boolean {
        try {
            this.embedding(model);

            return true;
        } catch {
            return false;
        }
    }

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

        if (!await this.locks.acquire(key, owner, KNOWLEDGE_LOCK_TTL_MS)) {
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

    async putDocument(collection: string, input: KnowledgeDocumentInput): Promise<KnowledgeDocumentPutResult> {
        const problem = managedDocumentProblem(input);

        if (problem) {
            throw problem;
        }

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

    sync(name: string): void {
        const { indexing } = this;

        if (!indexing) {
            throw new InvalidRunStateError('Knowledge is not started: call start() before sync().');
        }

        const wake = indexing.wakes.get(name);

        if (wake) {
            wake.notify();

            return;
        }

        const managed = indexing.managed.get(name);

        if (!managed) {
            throw new ValidationError(`Knowledge collection "${name}" is not indexed by this app.`);
        }

        this.reembeds.add(name);
        managed.wake.notify();
    }

    async stop(): Promise<void> {
        // a restart still waiting for an earlier stop is dropped
        this.restart = false;

        const { indexing } = this;

        if (!indexing) {
            await this.stopping;

            return;
        }

        this.indexing = undefined;
        indexing.controller.abort();

        const tasks: Promise<unknown>[] = [...indexing.tasks];

        if (this.runManagedPoll) {
            // aborts a pass in flight; settled() waits for it, so a restart never overlaps it
            tasks.push(this.managedPoll.stop().then(() => this.managedPoll.settled?.()));
        }

        const stopping = Promise.allSettled(tasks).then(() => {});

        this.stopping = stopping;

        try {
            await stopping;
        } finally {
            if (this.stopping === stopping) {
                this.stopping = undefined;
            }
        }
    }

    /**
     * One `embedMany` call; retries are the indexer's backoff on the clock,
     * never the AI SDK's. Given up after KNOWLEDGE_EMBED_TIMEOUT_MS on the
     * clock (aborted, and not awaited further for a provider that ignores
     * the abort), so a stalled request is a reported, retried failure.
     */
    protected async embed(model: string, texts: string[], signal: AbortSignal): Promise<number[][]> {
        const embedding = this.embedding(model);
        const timeout = new AbortController();
        const timer = this.clock.setTimeout(() => timeout.abort(new ChamviError({
            message: `The embedding model did not answer within ${KNOWLEDGE_EMBED_TIMEOUT_MS}ms.`,
            code: KNOWLEDGE_REQUEST_ERROR_CODE,
        })), KNOWLEDGE_EMBED_TIMEOUT_MS);

        timer.unref?.();

        const combined = AbortSignal.any([signal, timeout.signal]);
        let cleanup = () => {};
        const aborted = new Promise<never>((_, reject) => {
            const onAbort = () => reject(combined.reason);

            combined.addEventListener('abort', onAbort, { once: true });
            cleanup = () => combined.removeEventListener('abort', onAbort);
        });

        try {
            const { embeddings } = await Promise.race([
                embedMany({
                    model: embedding,
                    values: texts,
                    abortSignal: combined,
                    maxRetries: 0,
                }),
                aborted,
            ]);

            return embeddings;
        } finally {
            cleanup();
            timer.clear();
        }
    }

    async check(): Promise<void> {
        for (const definition of this.collections.values()) {
            for (const source of definition.sources) {
                try {
                    await source.check?.();
                } catch (error) {
                    throw new InvalidAgentDefinitionError(`Knowledge collection "${definition.name}": ${messageOf(error)}`);
                }
            }

            const record = await this.service.findOneCollection(definition.name);

            if (record?.kind === 'managed') {
                throw managedNameError(definition.name);
            }
        }
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
