/*
 * The OpenAPI document of the REST API, generated from the controllers by
 * `trapi generate` (the last build step) into `dist/swagger.json`.
 *
 * Nothing rewrites the document afterwards. The `@DQuerySchema` handler
 * contributes the query parameters of the three list routes, the error
 * response is declared document-wide, and the `ErrorResponse` component
 * rides `data.extra`. `test/unit/openapi/document.spec.ts` checks the result.
 */

import { readFileSync } from 'node:fs';
import type { Parameter, Response } from '@trapi/core';
import { defineConfig } from '@trapi/cli';
import { method, readString } from '@trapi/core';

const PACKAGE = JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8')) as { version: string; description: string };

const ERROR_SCHEMA_NAME = 'ErrorResponse';
const ERROR_ISSUE_SCHEMA_NAME = 'ErrorIssue';

/** `DEFAULT_PAGE_LIMIT` and `MAX_PAGE_LIMIT` of `src/app/constants.ts`. */
const PAGE_LIMIT_DEFAULT = 50;
const PAGE_LIMIT_MAX = 100;

function queryParameter(name: string, typeName: 'string' | 'integer', description: string, extra: Partial<Parameter> = {}): Parameter {
    return {
        parameterName: name,
        name,
        in: 'queryProp',
        required: false,
        description,
        type: { typeName },
        extensions: [],
        ...extra,
    } as Parameter;
}

function pageLimit(): Parameter {
    return queryParameter(
        'page[limit]',
        'integer',
        `Maximum number of entries to return, 1 to ${PAGE_LIMIT_MAX}; a value outside is rejected with 400.`,
        {
            default: PAGE_LIMIT_DEFAULT,
            validators: { minimum: { value: 1 }, maximum: { value: PAGE_LIMIT_MAX } },
        },
    );
}

function pageOffset(): Parameter {
    return queryParameter('page[offset]', 'integer', 'Number of entries to skip before the page starts.', {
        default: 0,
        validators: { minimum: { value: 0 } },
    });
}

/** Per `@DQuerySchema` name: the query parameters `parseRunListQuery`, `parseKvListQuery` and `parseCollectionQuery` read. */
const QUERY_PARAMETERS: Record<string, () => Parameter[]> = {
    runs: () => [
        queryParameter('filter', 'string', [
            'Select runs, bracket form, each key at most once:',
            '`filter[agent]=<agent name>`, `filter[parent]=<run id>`,',
            '`filter[status]=<status>` or a comma separated list of statuses (`queued,running`),',
            '`filter[waiting]=approval|dispatch` (runs waiting on that kind of wait point).',
            'Any other key, or a value of the wrong form, is rejected with 400.',
        ].join(' ')),
        queryParameter('sort', 'string', 'Order by creation time: `createdAt` (ascending, the default) or `-createdAt`. Any other value is rejected with 400.'),
        pageLimit(),
        pageOffset(),
    ],
    kv: () => [pageLimit(), pageOffset()],
    documents: () => [
        queryParameter('filter', 'string', [
            'Select documents by top-level field equality, bracket form: `filter[<field>]=<value>`, each field at most once.',
            'Only equality is supported, and `filter[id]` is rejected (`id` is the store id, not a document field).',
        ].join(' ')),
        pageLimit(),
    ],
};

const querySchemaHandler = method({
    match: { name: 'DQuerySchema', on: 'method' },
    apply: (ctx, draft) => {
        const name = readString(ctx.argument(0));
        const build = name ? QUERY_PARAMETERS[name] : undefined;

        if (!build) {
            throw new Error(`@DQuerySchema on '${draft.name}' has an unknown or unresolvable argument.`);
        }

        draft.parameters.push(...build());
    },
});

const ERROR_SCHEMA = {
    type: 'object',
    description: 'The error body of every failing request; `code` carries the semantics, the status the severity.',
    properties: {
        status: {
            type: 'integer',
            description: 'The HTTP status code.',
        },
        code: {
            type: 'string',
            description: 'The error code (a chamvi `ErrorCode` or an HTTP error code); the value to branch on.',
        },
        message: {
            type: 'string',
            description: 'A human-readable summary; a generic line on a 5xx.',
        },
        issues: {
            type: 'array',
            description: 'The validation issues of a rejected request body or query.',
            items: { $ref: `#/components/schemas/${ERROR_ISSUE_SCHEMA_NAME}` },
        },
    },
    required: ['status', 'code', 'message'],
};

/** An `@ebec/core` `Issue`: an item, or a group of nested issues. */
const ERROR_ISSUE_SCHEMA = {
    type: 'object',
    properties: {
        type: {
            type: 'string',
            enum: ['item', 'group'],
        },
        code: {
            type: 'string',
            description: 'The issue code (a validup or rapiq code).',
        },
        message: { type: 'string' },
        path: {
            type: 'array',
            description: 'Where the issue is, from the root of the body or query.',
            items: { anyOf: [{ type: 'string' }, { type: 'integer' }] },
        },
        issues: {
            type: 'array',
            description: 'A group\'s nested issues.',
            items: { $ref: `#/components/schemas/${ERROR_ISSUE_SCHEMA_NAME}` },
        },
    },
    required: ['type', 'message', 'path'],
};

const DEFAULT_RESPONSE: Response = {
    name: 'default',
    status: 'default',
    description: 'The request failed; the body is the error object.',
    schema: {
        typeName: 'refObject',
        refName: ERROR_SCHEMA_NAME,
        properties: [],
    } as any,
};

export default defineConfig({
    metadata: {
        // the controller files, not the `controller/index.ts` barrels
        entryPoint: [
            'src/**/controller.ts',
            'src/**/controller/!(index).ts',
        ],
        preset: {
            name: 'chamvi',
            extends: ['@routup/decorators/preset'],
            methods: [querySchemaHandler],
        },
        tsconfig: 'tsconfig.json',
        // the cache key ignores this file, so an edit here would serve a stale document
        cache: false,
    },
    swagger: {
        version: 'v3.2',
        data: {
            name: '@chamvi/http',
            version: PACKAGE.version,
            description: PACKAGE.description,
            operationIdStrategy: 'path',
            responses: [DEFAULT_RESPONSE],
            securityDefinitions: {
                bearer: {
                    type: 'http',
                    scheme: 'bearer',
                },
            },
            extra: {
                components: {
                    schemas: {
                        [ERROR_SCHEMA_NAME]: ERROR_SCHEMA,
                        [ERROR_ISSUE_SCHEMA_NAME]: ERROR_ISSUE_SCHEMA,
                    },
                },
            },
        },
    },
    output: { path: 'dist/swagger.json' },
});
