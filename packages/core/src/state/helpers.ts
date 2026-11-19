/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import { flattenIssueItems } from '@ebec/core';
import type { Issue } from '@ebec/core';
import { isFilter } from '@rapiq/core';
import type { ICondition, IFilters, IQuery } from '@rapiq/core';
import type { StandardJSONSchemaV1 } from '@standard-schema/spec';
import { buildIssuesForStandardSchemaIssues } from '@validup/standard-schema';
import type { JSONSchema7 } from 'ai';
import { ValidationError } from '../errors/index.ts';
import type { ToolContext } from '../tool/types.ts';
import type { StateSchema } from './types.ts';

export function describeIssues(issues: readonly Issue[]): string {
    return flattenIssueItems(issues).map((issue) => {
        const path = issue.path.map(String).join('.');

        return path ? `${path}: ${issue.message}` : issue.message;
    }).join('; ');
}

export async function validateStateDocument(agent: string, coll: string, schema: StateSchema | undefined, doc: unknown): Promise<unknown> {
    if (!schema) {
        return doc;
    }

    const collSchema = Object.hasOwn(schema, coll) ? schema[coll] : undefined;

    if (!collSchema) {
        throw new ValidationError(`Agent "${agent}" declares no state collection "${coll}".`);
    }

    const result = await collSchema['~standard'].validate(doc);

    if (result.issues) {
        const issues = buildIssuesForStandardSchemaIssues(result.issues);
        throw new ValidationError(`Invalid "${coll}" document: ${describeIssues(issues)}`, issues);
    }

    return result.value;
}

/** The collection's JSON Schema when its Standard Schema can produce one, else any object. */
export function docJsonSchema(schema: StateSchema[string]): JSONSchema7 {
    const converter = (schema['~standard'] as Partial<StandardJSONSchemaV1.Props>).jsonSchema;

    if (converter) {
        try {
            const converted = { ...converter.input({ target: 'draft-07' }) } as JSONSchema7;

            delete converted.$schema;

            return converted;
        } catch {
            // not representable as JSON Schema: fall through
        }
    }

    return { type: 'object' };
}

/**
 * State writes are idempotent but not commutative: memoizing them by input
 * would drop the last write of upsert A, upsert B, upsert A (in a run or its
 * replay). Every invocation therefore gets its own effect key, so a write is
 * always applied.
 */
export const perCallKey = (tool: string) => (_input: unknown, ctx: ToolContext) => `${ctx.run.runId}:${tool}:${randomUUID()}`;

/** The conditions of a query's filters that are joined with `and` at the top. */
export function topLevelConditions(filters: IFilters): ICondition[] {
    return filters.operator === 'and' ? [...filters.value] : [filters];
}

/**
 * A document listing's `where`: each top-level `eq` filter, given once, as
 * a document key and its value. Any other condition, a repeated key and
 * any sort is a ValidationError.
 */
export function readDocumentWhere(query: IQuery): Record<string, unknown> {
    const where: Record<string, unknown> = {};

    if (query.sorts.value.length > 0) {
        throw new ValidationError('A document listing is ordered by document id: it takes no sort.');
    }

    for (const condition of topLevelConditions(query.filters)) {
        if (!isFilter(condition) || condition.operator !== 'eq' || Object.hasOwn(where, condition.field)) {
            throw new ValidationError('A document listing takes top-level equality filters, each key once.');
        }

        where[condition.field] = condition.value;
    }

    return where;
}
