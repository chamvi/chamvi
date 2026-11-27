/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/errors';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { buildIssuesForStandardSchemaIssues } from '@validup/standard-schema';
import { describeIssues } from '../../state/helpers.ts';

/** `payload` parsed by `schema` (the parsed value); without one unchanged. */
export async function validateDispatchPayload(
    agent: string,
    role: string,
    schema: StandardSchemaV1 | undefined,
    payload: unknown,
): Promise<unknown> {
    if (!schema) {
        return payload;
    }

    const result = await schema['~standard'].validate(payload);

    if (result.issues) {
        const issues = buildIssuesForStandardSchemaIssues(result.issues);
        throw new ValidationError(`Invalid dispatch payload for agent "${agent}" role "${role}": ${describeIssues(issues)}`, issues);
    }

    return result.value;
}
