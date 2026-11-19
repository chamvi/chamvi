/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/core';

/**
 * The vectors of one batch checked: one per text, numbers only, one length
 * across the generation (ValidationError otherwise); answers that length.
 */
export function assertVectors(label: string, vectors: unknown, count: number, dimensions: number | undefined): number {
    if (!Array.isArray(vectors) || vectors.length !== count) {
        throw new ValidationError(`${label}: the embedding model returned no vector per text.`);
    }

    let length = dimensions;

    for (const vector of vectors) {
        const numbers = Array.isArray(vector) && vector.length > 0 && vector.every((value) => Number.isFinite(value));

        if (!numbers) {
            throw new ValidationError(`${label}: the embedding model returned a vector that is no list of numbers.`);
        }

        length ??= vector.length;

        if (vector.length !== length) {
            throw new ValidationError(
                `${label}: the embedding model returned ${vector.length}-dimensional vectors, the generation holds ${length}.`,
            );
        }
    }

    return length!;
}
