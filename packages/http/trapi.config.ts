/*
 * The OpenAPI document of the REST API, generated from the controllers by
 * `trapi generate` (the last build step) into `dist/swagger.json`.
 *
 * Nothing rewrites the document afterwards. The `@DQuerySchema` handler
 * contributes the query parameters of the three list routes, the
 * `@DProduces` handler the 200 of the SSE and download routes, the
 * `@DStatus` handler the 201 or 202 of the routes answering one, the error
 * response is declared document-wide, and the `ErrorResponse` component
 * rides `data.extra`. `test/unit/openapi/document.spec.ts` checks the result.
 */

import { readFileSync } from 'node:fs';
import { RunStatus } from '@chamvi/core';
import type {
    Parameter,
    RefObjectType,
    Response,
    Type,
} from '@trapi/core';
import { defineConfig } from '@trapi/cli';
import { method, readString } from '@trapi/core';
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from './src/app/constants.ts';

const PACKAGE = JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8')) as { version: string; description: string };

const ERROR_SCHEMA_NAME = 'ErrorResponse';
const ERROR_ISSUE_SCHEMA_NAME = 'ErrorIssue';

const STRING: Type = { typeName: 'string' };
const INTEGER: Type = { typeName: 'integer' };

function queryParameter(name: string, type: Type, description: string, extra: Partial<Parameter> = {}): Parameter {
    return {
        parameterName: name,
        name,
        in: 'queryProp',
        required: false,
        description,
        type,
        extensions: [],
        ...extra,
    };
}

function pageLimit(): Parameter {
    return queryParameter(
        'page[limit]',
        INTEGER,
        `Maximum number of entries to return, 1 to ${MAX_PAGE_LIMIT}; a value outside is rejected with 400.`,
        {
            default: DEFAULT_PAGE_LIMIT,
            validators: { minimum: { value: 1 }, maximum: { value: MAX_PAGE_LIMIT } },
        },
    );
}

function pageOffset(): Parameter {
    return queryParameter('page[offset]', INTEGER, 'Number of entries to skip before the page starts.', {
        default: 0,
        validators: { minimum: { value: 0 } },
    });
}

const ONCE = 'Given at most once; any other `filter[...]` key is rejected with 400.';

/**
 * Per `@DQuerySchema` name: the query parameters `parseRunListQuery`,
 * `parseKvListQuery` and `parseCollectionQuery` read. Filters are listed in
 * the bracket form; the expression form (`filter=eq(agent,'a')`) is named in
 * the operation descriptions.
 */
const QUERY_PARAMETERS: Record<string, () => Parameter[]> = {
    runs: () => [
        queryParameter('filter[agent]', STRING, `The runs of one agent, by name. ${ONCE}`),
        queryParameter('filter[parent]', STRING, `The child runs of one run, by run id. ${ONCE}`),
        queryParameter('filter[status]', STRING, [
            'The runs in one status, or in any of a comma separated list (`queued,running`).',
            `Statuses: ${Object.values(RunStatus).join(', ')}.`,
        ].join(' ')),
        queryParameter(
            'filter[waiting]',
            { typeName: 'enum', members: ['approval', 'dispatch'] },
            `The runs waiting on an approval, or on dispatched child runs. ${ONCE}`,
        ),
        queryParameter(
            'sort',
            { typeName: 'enum', members: ['createdAt', '-createdAt'] },
            'Order by creation time, ascending (the default) or descending.',
        ),
        pageLimit(),
        pageOffset(),
    ],
    kv: () => [pageLimit(), pageOffset()],
    documents: () => [
        queryParameter('filter[<field>]', STRING, [
            'Not a literal name: one parameter per document field, `filter[color]=red&filter[qty]=3`,',
            'matching documents whose top-level field equals the value.',
            'The value is read as a number, boolean or `null` where it parses as one.',
            'Each field at most once; only equality, no list; `filter[id]` and nested paths are rejected with 400.',
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

/** Per `@DProduces` media type: the schema of the 200 body. */
const PRODUCED_SCHEMAS: Record<string, Type> = {
    'text/event-stream': STRING,
    'application/octet-stream': { typeName: 'binary' },
};

const producesHandler = method({
    match: { name: 'DProduces', on: 'method' },
    apply: (ctx, draft) => {
        const mediaType = readString(ctx.argument(0));
        const description = readString(ctx.argument(1));
        const schema = mediaType ? PRODUCED_SCHEMAS[mediaType] : undefined;

        if (!mediaType || !schema || !description) {
            throw new Error(`@DProduces on '${draft.name}' has an unknown or unresolvable argument.`);
        }

        draft.responses.push({
            name: '200',
            status: '200',
            description,
            produces: [mediaType],
            schema,
        });
    },
});

/** Per `@DStatus` status: the description of the response that carries the return type. */
const SUCCESS_DESCRIPTIONS: Record<string, string> = {
    '201': 'Created.',
    '202': 'Accepted.',
};

const statusHandler = method({
    match: { name: 'DStatus', on: 'method' },
    apply: (ctx, draft) => {
        const status = readString(ctx.argument(0));
        const description = status ? SUCCESS_DESCRIPTIONS[status] : undefined;

        if (!status || !description) {
            throw new Error(`@DStatus on '${draft.name}' has an unknown or unresolvable argument.`);
        }

        // trapi documents the return type under this status and adds no 200
        draft.successStatus = status;
        draft.responses.push({
            name: status,
            status,
            description,
        });
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

const ERROR_SCHEMA_REF: RefObjectType = {
    typeName: 'refObject',
    refName: ERROR_SCHEMA_NAME,
    properties: [],
    deprecated: false,
};

const DEFAULT_RESPONSE: Response = {
    name: 'default',
    status: 'default',
    description: 'The request failed; the body is the error object.',
    schema: ERROR_SCHEMA_REF,
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
            methods: [querySchemaHandler, producesHandler, statusHandler],
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
