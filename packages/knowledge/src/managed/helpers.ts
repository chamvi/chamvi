/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/core';
import { APICallError } from 'ai';
import { CHUNKER_VERSION } from '../chunk/constants.ts';
import type { KnowledgeCollection } from '../repository/types.ts';
import { documentProblem } from '../source/helpers.ts';
import type { KnowledgeDocumentInput } from '../source/types.ts';
import { MANAGED_CONTENT_MAX_CHARS } from './constants.ts';

/**
 * Whether the provider refused this input for good: an `APICallError` with a
 * status from 400 to 499 other than 408 (timeout) and 429 (rate limit).
 * Anything else (a 5xx, a timeout, a network error) is no verdict on the
 * document.
 */
export function isProviderRejection(error: unknown): error is APICallError {
    if (!APICallError.isInstance(error) || error.statusCode === undefined) {
        return false;
    }

    const status = error.statusCode;

    return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

/** Whether a managed record serves another model or chunker than `model` and this chunker. */
export function needsReembed(record: KnowledgeCollection, model: string | undefined): model is string {
    return model !== undefined &&
        record.kind === 'managed' &&
        (record.model !== model || record.chunker !== CHUNKER_VERSION);
}

/** The ValidationError of a document a request sent, or undefined when it is valid. */
export function managedDocumentProblem(value: unknown): ValidationError | undefined {
    const problem = documentProblem(value, 'request');

    if (problem) {
        return problem;
    }

    const { id, content } = value as KnowledgeDocumentInput;

    if (content.length === 0 || content.length > MANAGED_CONTENT_MAX_CHARS) {
        return new ValidationError(`Knowledge document "${id}": content must be 1 to ${MANAGED_CONTENT_MAX_CHARS} characters.`);
    }

    return undefined;
}
