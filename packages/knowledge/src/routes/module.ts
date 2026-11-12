/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { can } from '@chamvi/access';
import { RepositoryNotFoundError, ValidationError } from '@chamvi/core';
import type {
    HttpRoute,
    HttpRouteContext,
    HttpRouteMethod,
    HttpRouteRequest,
    HttpRouteResult,
    Principal,
} from '@chamvi/http';
import type { IKnowledge } from '../knowledge/types.ts';
import type { KnowledgeDocumentInput } from '../source/types.ts';
import { KNOWLEDGE_READ_PERMISSION, KNOWLEDGE_ROUTE_PATH, KNOWLEDGE_WRITE_PERMISSION } from './constants.ts';
import {
    documentIdOf,
    parseSubpath,
    readDocumentQuery,
    readJsonObject,
    toCollectionView,
    toDocumentView,
} from './helpers.ts';
import type { KnowledgeDocumentListView } from './types.ts';

type HandlerInput = {
    request: HttpRouteRequest;
    segments: string[];
    principal: Principal;
    ctx: HttpRouteContext;
};

type Handler = (input: HandlerInput) => Promise<HttpRouteResult | undefined>;

function notFound(): RepositoryNotFoundError {
    return new RepositoryNotFoundError('knowledge collections');
}

function readHandler(knowledge: IKnowledge): Handler {
    const { repository } = knowledge;

    return async ({
        request,
        segments,
        principal,
        ctx,
    }) => {
        const [root, name, sub, id, ...rest] = segments;

        if (root !== 'collections' || rest.length > 0) {
            return undefined;
        }

        if (name === undefined) {
            const records = await repository.findCollections();
            const now = ctx.clock.now();
            const readable = await Promise.all(records.map((record) => can(principal, KNOWLEDGE_READ_PERMISSION, {
                attributes: { name: record.name },
                now,
            })));
            const data = records
                .filter((_record, index) => readable[index])
                .map((record) => toCollectionView(knowledge.view(record)));

            return { status: 200, body: { data } };
        }

        if (sub === undefined) {
            const record = await repository.findOneCollectionOrFail(name);

            return { status: 200, body: toCollectionView(knowledge.view(record)) };
        }

        if (sub !== 'documents') {
            return undefined;
        }

        if (id === undefined) {
            const query = readDocumentQuery(new URL(request.request.url));

            await repository.findOneCollectionOrFail(name);

            const page = await repository.findDocuments(name, query);
            const body: KnowledgeDocumentListView = {
                data: page.data.map((document) => toDocumentView(document)),
                meta: {
                    total: page.total, 
                    limit: query.limit, 
                    offset: query.offset, 
                },
            };

            return { status: 200, body };
        }

        const document = await repository.findOneDocumentOrFail(name, documentIdOf(id));

        return { status: 200, body: toDocumentView(document, true) };
    };
}

function postHandler(knowledge: IKnowledge): Handler {
    return async ({ request, segments }) => {
        const [root, name, sub, ...rest] = segments;

        if (root !== 'collections' || rest.length > 0) {
            return undefined;
        }

        if (name === undefined) {
            const body = await readJsonObject(request);

            if (typeof body.name !== 'string') {
                throw new ValidationError('A knowledge collection needs a name.');
            }

            // the name is known only now: the gate before the body was for some collection
            await request.authorize(KNOWLEDGE_WRITE_PERMISSION, { name: body.name });

            const record = await knowledge.createCollection(body.name);

            return { status: 201, body: toCollectionView(knowledge.view(record)) };
        }

        if (sub !== 'sync') {
            return undefined;
        }

        try {
            knowledge.sync(name);
        } catch (error) {
            // a name without a loop here: nothing this app indexes
            if (error instanceof ValidationError) {
                throw notFound();
            }

            throw error;
        }

        return { status: 202, body: { name } };
    };
}

function putHandler(knowledge: IKnowledge): Handler {
    return async ({ request, segments }) => {
        const [root, name, sub, id, ...rest] = segments;

        if (root !== 'collections' || name === undefined || sub !== 'documents' || id === undefined || rest.length > 0) {
            return undefined;
        }

        const documentId = documentIdOf(id);
        const body = await readJsonObject(request);
        const input = {
            id: documentId,
            content: body.content,
            ...(body.title === undefined ? {} : { title: body.title }),
            ...(body.source === undefined ? {} : { source: body.source }),
            ...(body.metadata === undefined ? {} : { metadata: body.metadata }),
        } as KnowledgeDocumentInput;
        const result = await knowledge.putDocument(name, input);

        return result.changed && result.status === 'pending' ?
            { status: 202, body: { status: 'pending' } } :
            { status: 200, body: { status: result.status } };
    };
}

function deleteHandler(knowledge: IKnowledge): Handler {
    return async ({ segments }) => {
        const [root, name, sub, id, ...rest] = segments;

        if (root !== 'collections' || name === undefined || rest.length > 0) {
            return undefined;
        }

        if (sub === undefined) {
            if (!await knowledge.deleteCollection(name)) {
                throw notFound();
            }

            return { status: 204 };
        }

        if (sub !== 'documents' || id === undefined) {
            return undefined;
        }

        if (!await knowledge.deleteDocument(name, documentIdOf(id))) {
            throw new RepositoryNotFoundError('knowledge documents');
        }

        return { status: 204 };
    };
}

/**
 * The REST API of the knowledge collections, as extra routes of
 * `createHttpApp({ routes })`: one prefix route per method under
 * KNOWLEDGE_ROUTE_PATH. Every request is authorized first
 * (`chamvi_knowledge_read` for `GET`, `chamvi_knowledge_write` for the
 * others): for `{ name }` when the path names one collection, else for
 * some collection (the listing then keeps the readable ones, a create
 * checks the body's name). Then it is dispatched by the subpath's
 * segments, each percent-decoded once (a document id may hold `/` as
 * `%2F`). Any other path answers 404; errors render through the
 * app's error handler (ValidationError 400, RepositoryNotFoundError 404,
 * InvalidRunStateError 409).
 */
export function knowledgeRoutes(knowledge: IKnowledge): HttpRoute[] {
    const handlers: Array<[HttpRouteMethod, string, Handler]> = [
        ['GET', KNOWLEDGE_READ_PERMISSION, readHandler(knowledge)],
        ['POST', KNOWLEDGE_WRITE_PERMISSION, postHandler(knowledge)],
        ['PUT', KNOWLEDGE_WRITE_PERMISSION, putHandler(knowledge)],
        ['DELETE', KNOWLEDGE_WRITE_PERMISSION, deleteHandler(knowledge)],
    ];

    return handlers.map(([method, permission, handler]): HttpRoute => ({
        method,
        path: KNOWLEDGE_ROUTE_PATH,
        prefix: true,
        handler: async (request, ctx) => {
            let segments: string[];

            try {
                segments = parseSubpath(request.subpath);
            } catch (error) {
                // 401 and 403 before a 400
                await request.authorize(permission);

                throw error;
            }

            const name = segments[0] === 'collections' ? segments[1] : undefined;
            const principal = await request.authorize(permission, name === undefined ? undefined : { name });
            const result = await handler({
                request,
                segments,
                principal,
                ctx,
            });

            if (!result) {
                return {
                    status: 404,
                    body: {
                        status: 404, 
                        code: 'not_found', 
                        message: 'Not Found', 
                    }, 
                };
            }

            return result;
        },
    }));
}
