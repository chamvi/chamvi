/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock, ILockService, IModelResolver } from '@chamvi/core';
import { ChamviError, InvalidAgentDefinitionError } from '@chamvi/core';
import type { EmbeddingModel } from 'ai';
import { embedMany } from 'ai';
import { defineIntervalComponent } from 'hubwire';
import type { IComponent } from 'hubwire';
import { isEmbeddingModelObject, managedNameError } from '../collection/helpers.ts';
import type { ResolvedKnowledgeCollection } from '../collection/types.ts';
import { KNOWLEDGE_EMBED_TIMEOUT_MS, KNOWLEDGE_REQUEST_ERROR_CODE } from '../indexer/constants.ts';
import { messageOf } from '../indexer/helpers/index.ts';
import type { KnowledgeWake } from '../indexer/types.ts';
import { KNOWLEDGE_MANAGED_COMPONENT_NAME, KNOWLEDGE_MANAGED_POLL_MS } from '../managed/constants.ts';
import type { ManagedLoop } from '../managed/types.ts';
import type { IKnowledgeService } from '../service/types.ts';
import type { IKnowledgeCollectionRepository } from '../store/types.ts';
import { normalizeOptions, resolveCollection, resolveEmbeddingModel } from './helpers.ts';
import type { KnowledgeErrorContext, KnowledgeOptions } from './types.ts';

/**
 * The state of a knowledge instance and its embedding models; the indexing
 * (`KnowledgeIndexing`) and the managed collections (`Knowledge`) build on it.
 */
export abstract class KnowledgeBase {
    readonly repository: IKnowledgeCollectionRepository;

    readonly service: IKnowledgeService;

    protected readonly locks: Pick<ILockService, 'acquire' | 'renew' | 'release'>;

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

    protected hasEmbedding(model: string): boolean {
        try {
            this.embedding(model);

            return true;
        } catch {
            return false;
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

    /** One pass of `managedPoll`. */
    protected abstract pollManaged(signal: AbortSignal): Promise<void>;
}
