/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    ContractKnowledgeChunk,
    ContractKnowledgeCollection,
    ContractKnowledgeDocument,
} from './types.ts';
import { AT } from './constants.ts';

export function collectionOf(
    name: string,
    patch: Partial<ContractKnowledgeCollection> = {},
): ContractKnowledgeCollection {
    return {
        name,
        kind: 'declared',
        trusted: true,
        generation: 1,
        model: 'mock-provider/mock-model-id',
        dimensions: 2,
        chunker: 'text-v1',
        status: 'ready',
        createdAt: AT,
        updatedAt: AT,
        ...patch,
    };
}

export function documentOf(
    collection: string,
    id: string,
    patch: Partial<ContractKnowledgeDocument> = {},
): ContractKnowledgeDocument {
    return {
        collection,
        id,
        content: `content of ${id}`,
        hash: `sha256:${id}`,
        status: 'ready',
        generation: 1,
        updatedAt: AT,
        ...patch,
    };
}

export function chunkOf(
    index: number,
    vector: number[],
    text = `chunk ${index}`,
    patch: Partial<ContractKnowledgeChunk> = {},
): ContractKnowledgeChunk {
    return {
        index,
        text,
        start: index * 10,
        end: (index * 10) + text.length,
        vector,
        ...patch,
    };
}
