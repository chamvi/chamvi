/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { flattenIssueItems } from '@ebec/core';
import type { Issue } from '@ebec/core';
import { BadRequestError } from '@chamvi/errors';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { buildIssuesForStandardSchemaIssues } from '@validup/standard-schema';
import { isObject } from 'smob';
import type { Container } from 'validup';

/**
 * Validates a JSON object body with a validup container. A missing body
 * reads as `{}`; unknown keys are dropped.
 */
export async function validateBody<T extends Record<string, any>>(
    container: Container<T>,
    body: unknown,
): Promise<T> {
    if (body === undefined) {
        body = {};
    }

    if (!isObject(body)) {
        throw new BadRequestError({ message: 'The request body must be a JSON object.' });
    }

    return container.run(body as Partial<T>);
}

function describeIssues(issues: readonly Issue[]): string {
    return flattenIssueItems(issues).map((issue) => {
        const path = issue.path.map(String).join('.');

        return path ? `${path}: ${issue.message}` : issue.message;
    }).join('; ');
}

/** Validates a trigger payload (any JSON) with the trigger's Standard Schema. */
export async function validatePayload(schema: StandardSchemaV1 | undefined, payload: unknown): Promise<unknown> {
    if (!schema) {
        return payload;
    }

    const result = await schema['~standard'].validate(payload);

    if (result.issues) {
        const issues = buildIssuesForStandardSchemaIssues(result.issues);
        throw new BadRequestError({ message: `Invalid payload: ${describeIssues(issues)}`, issues });
    }

    return result.value;
}
