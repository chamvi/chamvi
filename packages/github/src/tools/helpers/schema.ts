/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { jsonSchema } from 'ai';
import type { JSONSchema7 } from 'ai';
import { REPO_PATTERN } from '../constants.ts';
import type { NumberInput, RepoInput } from '../types.ts';

export const REPO_PROPERTY: JSONSchema7 = {
    type: 'string',
    pattern: REPO_PATTERN,
    description: 'The repository as "owner/name".',
};

/** An object schema of `properties`, all required unless listed in `optional`. */
export function objectSchema<T>(properties: Record<string, JSONSchema7>, optional: string[] = []) {
    return jsonSchema<T>({
        type: 'object',
        properties,
        required: Object.keys(properties).filter((key) => !optional.includes(key)),
        additionalProperties: false,
    });
}

/** `{ repo, number }` for an issue or a pull request. */
export function numberSchema<T extends NumberInput = NumberInput>(what: string, extra: Record<string, JSONSchema7> = {}, optional: string[] = []) {
    return objectSchema<T>({
        repo: REPO_PROPERTY,
        number: {
            type: 'integer',
            minimum: 1,
            description: `The ${what} number.`,
        },
        ...extra,
    }, optional);
}

/** `{ repo }`. */
export function repoSchema() {
    return objectSchema<RepoInput>({ repo: REPO_PROPERTY });
}
