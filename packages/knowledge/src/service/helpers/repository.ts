/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';
import type { IKnowledgeCollectionRepository } from '../../store/types.ts';

const REPOSITORY_METHODS = ['findOneBy', 'findMany', 'findManyBy', 'create', 'save', 'upsert', 'upsertMany', 'remove', 'removeManyBy', 'transaction'] as const;

function hasMethods(value: unknown, methods: readonly string[]): boolean {
    return isObject(value) && methods.every((method) => typeof value[method] === 'function');
}

/** Whether `value` looks like an `IKnowledgeCollectionRepository` with its documents and chunks. */
export function isKnowledgeRepository(value: unknown): value is IKnowledgeCollectionRepository {
    return hasMethods(value, REPOSITORY_METHODS) &&
        hasMethods((value as Record<string, unknown>).documents, REPOSITORY_METHODS) &&
        hasMethods((value as Record<string, unknown>).chunks, [...REPOSITORY_METHODS, 'search']);
}
