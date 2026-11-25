/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { MemoryEntityRepository, MemoryRegistry } from '@chamvi/store-memory';
import { Query, eq } from '@rapiq/core';
import { decodeQuery, defineSchema, scopeQuery } from '@chamvi/http';
import { call, createTestApp } from '../../utils/app.ts';

type Note = {
    id: string;
    title: string;
    secret: string;
};

const MARKER = 'marker9c1d';

const NOTE_LIST_SCHEMA = defineSchema<Note>({
    filters: ['title'],
    sorts: ['title'],
    maxLimit: 10,
    defaultLimit: 2,
});

/** An app's list endpoint as a route: decode against the schema, list through the port. */
async function createNotesApp() {
    const notes = new MemoryEntityRepository<Note>({
        entity: 'note',
        registry: new MemoryRegistry(),
        key: ['id'],
    });

    for (const [id, title] of [['00000000-0000-7000-8000-000000000003', 'b'], ['00000000-0000-7000-8000-000000000001', 'B'], ['00000000-0000-7000-8000-000000000002', 'b']]) {
        await notes.save(notes.create({
            id: id!,
            title: title!,
            secret: MARKER,
        }));
    }

    const { app } = createTestApp({
        routes: [{
            method: 'GET',
            path: '/notes',
            handler: async (request) => {
                const query = decodeQuery(new URL(request.request.url).searchParams, NOTE_LIST_SCHEMA);
                const { data, meta } = await notes.findMany(query);

                return { status: 200, body: { data: data.map(({ id, title }) => ({ id, title })), meta } };
            },
        }],
    });

    return app;
}

describe('an app\'s list endpoint', () => {
    it('answers the page the schema allows, matched case-sensitively and ordered with the key as tie-break', async () => {
        const app = await createNotesApp();
        const response = await call(app, 'GET', '/notes?filter[title]=b&sort=-title');

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            data: [
                { id: '00000000-0000-7000-8000-000000000003', title: 'b' },
                { id: '00000000-0000-7000-8000-000000000002', title: 'b' },
            ],
            meta: {
                total: 2,
                limit: 2,
                offset: 0,
            },
        });
    });

    it('answers 400 for a filter the schema does not allow, naming the key and no value', async () => {
        const app = await createNotesApp();
        const response = await call(app, 'GET', `/notes?filter[secret]=${MARKER}`);
        const text = await response.text();

        expect(response.status).toBe(400);
        expect(JSON.parse(text)).toMatchObject({ status: 400, code: 'bad_request' });
        expect(JSON.parse(text).message).toContain('secret');
        expect(text).not.toContain(MARKER);
    });

    it('answers 400 for a limit above the schema\'s maximum', async () => {
        const app = await createNotesApp();
        const response = await call(app, 'GET', '/notes?page[limit]=11');

        expect(response.status).toBe(400);
        expect((await response.json()).message).toBe('The pagination limit must not exceed the value of 10.');
    });

    it('a scope anded onto a nested request cannot be widened by an or in the request', async () => {
        type Owned = {
            id: string;
            title: string;
            owner: string
        };

        const owned = new MemoryEntityRepository<Owned>({
            entity: 'owned',
            registry: new MemoryRegistry(),
            key: ['id'],
        });

        for (const [id, title, owner] of [['1', 'a', 'me'], ['2', 'b', 'other'], ['3', 'b', 'me']]) {
            await owned.save(owned.create({
                id: id!,
                title: title!,
                owner: owner!,
            }));
        }

        const schema = defineSchema<Owned>({ filters: ['title'], nested: true });
        const query = decodeQuery(new URLSearchParams('filter=or(eq(title,\'a\'),eq(title,\'b\'))'), schema);
        const { data, meta } = await owned.findMany(scopeQuery(query, eq('owner', 'me')));

        expect(data.map((row) => row.id)).toEqual(['1', '3']);
        expect(meta.total).toBe(2);

        // a query without filters takes the scope alone, and the page and order stay
        const scoped = scopeQuery(decodeQuery(new URLSearchParams('page[limit]=1'), schema), eq('owner', 'other'));

        expect((await owned.findMany(scoped)).data.map((row) => row.id)).toEqual(['2']);
        expect(scoped.pagination).toMatchObject({ limit: 1, offset: 0 });
    });

    it('keeps every node of the query it scopes', () => {
        const schema = defineSchema<Note>({ filters: ['title'], sorts: ['title'] });
        const decoded = decodeQuery(new URLSearchParams('filter[title]=a&sort=title&page[limit]=3'), schema);
        const groups = { marker: 'groups' } as never;
        const aggregates = { marker: 'aggregates' } as never;
        const query = new Query({
            fields: decoded.fields,
            filters: decoded.filters,
            relations: decoded.relations,
            sorts: decoded.sorts,
            pagination: decoded.pagination,
            groups,
            aggregates,
        });
        const scoped = scopeQuery(query, eq('secret', MARKER));

        expect(scoped.fields).toBe(query.fields);
        expect(scoped.relations).toBe(query.relations);
        expect(scoped.sorts).toBe(query.sorts);
        expect(scoped.pagination).toBe(query.pagination);
        expect(scoped.groups).toBe(groups);
        expect(scoped.aggregates).toBe(aggregates);
        expect(scoped.filters.operator).toBe('and');
        expect(query.filters.value).toHaveLength(1);
    });
});
