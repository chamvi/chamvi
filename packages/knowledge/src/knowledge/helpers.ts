/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import type { IModelResolver } from '@chamvi/core';
import { InvalidAgentDefinitionError, systemClock } from '@chamvi/core';
import type { EmbeddingModel } from 'ai';
import { isObject } from 'smob';
import { isEmbeddingModelObject, modelIdentity } from '../collection/helpers.ts';
import { knowledgeCollection } from '../collection/module.ts';
import type { EmbeddingModelRef, KnowledgeCollectionDefinition, ResolvedKnowledgeCollection } from '../collection/types.ts';
import type { IKnowledgeRepository } from '../repository/types.ts';
import type { KnowledgeErrorContext, KnowledgeOptions } from './types.ts';

const REPOSITORY_METHODS: readonly (keyof IKnowledgeRepository)[] = [
    'saveCollection',
    'findOneCollection',
    'findOneCollectionOrFail',
    'findCollections',
    'deleteCollection',
    'saveDocument',
    'findOneDocument',
    'findOneDocumentOrFail',
    'findDocumentIds',
    'findDocuments',
    'updateDocument',
    'deleteDocument',
    'replaceChunks',
    'deleteGeneration',
    'deleteGenerationsExcept',
    'search',
];

type NormalizedOptions = Required<Omit<KnowledgeOptions, 'models' | 'embeddingModel'>> & Pick<KnowledgeOptions, 'models' | 'embeddingModel'>;

function messageOf(error: unknown): string {
    return Error.isError(error) ? error.message : String(error);
}

function hasMethods(value: unknown, methods: readonly string[]): boolean {
    return isObject(value) && methods.every((method) => typeof value[method] === 'function');
}

/** Whether `value` has every method of IKnowledgeRepository. */
export function isKnowledgeRepository(value: unknown): value is IKnowledgeRepository {
    return hasMethods(value, REPOSITORY_METHODS);
}

/** The options checked, with their defaults (InvalidAgentDefinitionError). */
export function normalizeOptions(options: KnowledgeOptions): NormalizedOptions {
    if (!isObject(options)) {
        throw new InvalidAgentDefinitionError('createKnowledge() options must be an object.');
    }

    if (!isKnowledgeRepository(options.repository)) {
        throw new InvalidAgentDefinitionError('createKnowledge() repository must be a knowledge repository.');
    }

    if (!hasMethods(options.locks, ['acquire', 'release'])) {
        throw new InvalidAgentDefinitionError('createKnowledge() locks must have acquire() and release().');
    }

    if (options.collections !== undefined && !Array.isArray(options.collections)) {
        throw new InvalidAgentDefinitionError('createKnowledge() collections must be an array.');
    }

    if (options.models !== undefined && !hasMethods(options.models, ['check', 'resolve'])) {
        throw new InvalidAgentDefinitionError('createKnowledge() models must be a model resolver.');
    }

    if (
        options.embeddingModel !== undefined &&
        typeof options.embeddingModel !== 'string' &&
        !isEmbeddingModelObject(options.embeddingModel)
    ) {
        throw new InvalidAgentDefinitionError('createKnowledge() embeddingModel must be a model string or an embedding model.');
    }

    const clock = options.clock ?? systemClock;

    if (!hasMethods(clock, ['now', 'setTimeout'])) {
        throw new InvalidAgentDefinitionError('createKnowledge() clock must have now() and setTimeout().');
    }

    if (options.owner !== undefined && (typeof options.owner !== 'string' || options.owner.length === 0)) {
        throw new InvalidAgentDefinitionError('createKnowledge() owner must be a non-empty string.');
    }

    if (options.onError !== undefined && typeof options.onError !== 'function') {
        throw new InvalidAgentDefinitionError('createKnowledge() onError must be a function.');
    }

    const report = options.onError ?? ((error: unknown, context: KnowledgeErrorContext) => {
        // eslint-disable-next-line no-console
        console.error('[chamvi]', error, context);
    });

    return {
        repository: options.repository,
        locks: options.locks,
        collections: options.collections ?? [],
        models: options.models,
        ...(options.embeddingModel === undefined ? {} : { embeddingModel: options.embeddingModel }),
        clock,
        // per instance: two in one process never release each other's locks
        owner: options.owner ?? `${hostname()}-${process.pid}-${randomUUID()}`,
        // a throwing onError is contained: it would reject an indexing loop nothing awaits
        onError: (error, context) => {
            try {
                report(error, context);
            } catch (thrown) {
                // eslint-disable-next-line no-console
                console.error('[chamvi]', thrown, context);
            }
        },
    };
}

/**
 * An embedding model ref resolved to its stored identity and model: an
 * object as is (`<provider>/<model id>`), a string through
 * `models.embedding()` (the ref is the identity); every failure an
 * InvalidAgentDefinitionError prefixed with `label`.
 */
export function resolveEmbeddingModel(
    ref: EmbeddingModelRef,
    models: IModelResolver | undefined,
    label: string,
): { model: string; embedding: EmbeddingModel } {
    if (typeof ref !== 'string') {
        return { model: modelIdentity(ref as Exclude<typeof ref, string>), embedding: ref };
    }

    if (!models) {
        throw new InvalidAgentDefinitionError(`${label}: the model string "${ref}" needs a model resolver.`);
    }

    if (typeof models.embedding !== 'function') {
        throw new InvalidAgentDefinitionError(`${label}: the model resolver hands out no embedding models.`);
    }

    let embedding: unknown;

    try {
        embedding = models.embedding(ref);
    } catch (error) {
        throw new InvalidAgentDefinitionError(`${label}: ${messageOf(error)}`);
    }

    if (!isEmbeddingModelObject(embedding)) {
        throw new InvalidAgentDefinitionError(`${label}: the model resolver gave no embedding model for "${ref}".`);
    }

    return { model: ref, embedding };
}

/**
 * A declared collection with its model resolved (see resolveEmbeddingModel),
 * every failure prefixed with the collection.
 */
export function resolveCollection(input: KnowledgeCollectionDefinition, models?: IModelResolver): ResolvedKnowledgeCollection {
    if (!isObject(input)) {
        throw new InvalidAgentDefinitionError('createKnowledge() collections must be knowledgeCollection() definitions.');
    }

    // a hand-built definition passes the same checks
    const definition = knowledgeCollection(input.name, input);
    const { model, embedding } = resolveEmbeddingModel(definition.model, models, `Knowledge collection "${definition.name}"`);

    return {
        name: definition.name,
        model,
        embedding,
        sources: definition.sources,
        trusted: definition.trusted,
        ...(definition.resyncMs === undefined ? {} : { resyncMs: definition.resyncMs }),
    };
}
