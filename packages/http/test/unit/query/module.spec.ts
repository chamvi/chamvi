/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { BadRequestError } from '@ebec/http';
import { describe, expect, it } from 'vitest';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { decodeQuery, defineSchema } from '@chamvi/http';

type Note = {
    id: string;
    title: string;
    count: number;
    parentId: string;
    parent?: { id: string };
    secret: string;
};

const MARKER = 'marker7f3a';

const schema = defineSchema<Note>({
    name: 'note',
    fields: ['id', 'title', 'count'],
    filters: ['title', 'count', 'parentId'],
    operators: { title: ['eq', 'ne', 'in', 'startsWith'] },
    sorts: ['title', 'count'],
    relations: ['parent'],
    maxLimit: 20,
    defaultLimit: 5,
});

/** The schema above with nested filters: a reserved key is refused under every option. */
const nestedSchema = defineSchema<Note>({
    fields: ['id', 'title', 'count'],
    filters: ['title', 'count', 'parentId'],
    sorts: ['title', 'count'],
    relations: ['parent'],
    nested: true,
});

const decode = (query: string, using = schema) => decodeQuery(new URLSearchParams(query), using);

function refusal(fn: () => unknown): BadRequestError {
    try {
        fn();
    } catch (error) {
        expect(error).toBeInstanceOf(BadRequestError);

        return error as BadRequestError;
    }

    throw new Error('not refused');
}

describe('defineSchema', () => {
    it.each([
        ['a default limit above the maximum', { defaultLimit: 30, maxLimit: 20 }],
        ['a limit that is no positive integer', { maxLimit: 0 }],
        ['an operator rapiq does not know', { filters: ['title'], operators: { title: ['like'] } }],
        ['an operator for a field that takes no filter', { filters: ['title'], operators: { count: ['eq'] } }],
        ['an empty key', { key: [] }],
        ['a nested relation without its parent', { relations: ['parent.parent'] }],
    ])('refuses %s', (_, options) => {
        expect(() => defineSchema(options as never)).toThrow(InvalidAgentDefinitionError);
    });

    it.each([
        ['filters', { filters: ['parent.id'] }],
        ['sorts', { sorts: ['parent.id'] }],
        ['fields', { fields: ['parent.id'] }],
        ['key', { key: ['parent.id'] }],
        ['sort', { sort: { 'parent.id': 'ASC' } }],
    ])('refuses a dotted path among its %s, naming it: a relation\'s field is not supported', (_, options) => {
        expect(() => defineSchema(options as never)).toThrow(/"parent\.id"/);
    });

    it('takes a nested relation listed with its parent', () => {
        expect(defineSchema({ relations: ['parent', 'parent.parent'] }).relations).toEqual(['parent', 'parent.parent']);
    });

    it('allows nothing by default: no filter, no sort, no relation, no field selection', () => {
        const empty = defineSchema();

        expect(refusal(() => decode('filter[title]=a', empty)).message).toContain('title');
        expect(refusal(() => decode('sort=title', empty)).message).toContain('title');
        expect(refusal(() => decode('include=parent', empty)).message).toContain('parent');
        expect(refusal(() => decode('fields=title', empty)).message).toContain('title');
    });
});

describe('decodeQuery', () => {
    it('decodes the bracket forms: equality, inequality, a list, a comparison, null and a prefix', () => {
        const query = decode('filter[title]=a,b&filter[count]=>3&filter[parentId]=null');

        expect(query.filters.value).toEqual([
            {
                field: 'title',
                operator: 'in',
                value: ['a', 'b'],
            },
            {
                field: 'count',
                operator: 'gt',
                value: 3,
            },
            {
                field: 'parentId',
                operator: 'eq',
                value: null,
            },
        ]);
        expect(decode('filter[title]=!a').filters.value).toEqual([{
            field: 'title',
            operator: 'ne',
            value: 'a',
        }]);
        expect(decode('filter[title]=a~').filters.value).toEqual([{
            field: 'title',
            operator: 'startsWith',
            value: 'a',
        }]);
    });

    it('decodes the expression form to the same leaf', () => {
        expect(decode('filter=eq(title,\'a\')').filters.value).toEqual([{
            field: 'title',
            operator: 'eq',
            value: 'a',
        }]);
    });

    it('decodes a sort, a page, an include and a field selection', () => {
        const query = decode('sort=-count&page[limit]=2&page[offset]=4&include=parent');

        expect(query.sorts.value).toEqual([{ name: 'count', operator: 'DESC' }, { name: 'id', operator: 'DESC' }]);
        expect(query.pagination).toMatchObject({ limit: 2, offset: 4 });
        expect(query.relations.value.map((relation) => relation.name)).toEqual(['parent']);
        expect(decode('fields=title').fields.value.map((field) => field.name)).toEqual(['title']);
    });

    it('selects every field when the request names none', () => {
        expect(decode('').fields.value).toEqual([]);
        expect(decode('include=parent').fields.value).toEqual([]);
    });

    it.each([
        ['a filter', `filter[secret]=${MARKER}`, 'secret'],
        ['a sort', 'sort=secret', 'secret'],
        ['a relation', 'include=secret', 'secret'],
        ['a field', 'fields=secret', 'secret'],
    ])('a %s the schema does not allow is refused, naming the key and no value', (_, query, key) => {
        const error = refusal(() => decode(query));

        expect(error.message).toContain(key);
        expect(JSON.stringify({ message: error.message, issues: error.issues })).not.toContain(MARKER);
    });

    it.each([
        'filter[__proto__]=x',
        'filter[constructor]=x',
        'filter[prototype]=x',
        'filter[title][__proto__]=x',
        'filter=__proto__==x',
        'sort=__proto__',
        'sort=-constructor',
        'fields=__proto__',
        'fields=constructor',
        'fields[__proto__]=title',
        'include=__proto__',
        'include=constructor',
        'page[__proto__]=1',
        'page[constructor]=1',
    ])('a reserved key is refused, never ignored: %s', (query) => {
        refusal(() => decode(query));
        refusal(() => decode(query, nestedSchema));
    });

    it('an operator the schema does not allow for a field is refused, naming the field and no value', () => {
        const contains = refusal(() => decode(`filter[title]=~${MARKER}~`));
        const comparison = refusal(() => decode(`filter[title]=>${MARKER}`));

        expect(contains.message).toContain('filter[title]');
        expect(comparison.message).toContain('filter[title]');
        expect(JSON.stringify([contains.message, contains.issues, comparison.message, comparison.issues])).not.toContain(MARKER);
        // a field without its own list takes the comparisons
        expect(decode('filter[count]=<=3').filters.value).toEqual([{
            field: 'count',
            operator: 'lte',
            value: 3,
        }]);
    });

    it('maxLimit caps the page: a limit above it is refused, none takes the default limit', () => {
        expect(refusal(() => decode('page[limit]=21')).message).toBe('The pagination limit must not exceed the value of 20.');
        expect(decode('page[limit]=20').pagination).toMatchObject({ limit: 20, offset: 0 });
        expect(decode('').pagination).toMatchObject({ limit: 5, offset: 0 });
        expect(decodeQuery(new URLSearchParams(''), defineSchema()).pagination).toMatchObject({ limit: 50, offset: 0 });
        expect(refusal(() => decodeQuery(new URLSearchParams('page[limit]=101'), defineSchema())).message).toContain('100');
    });

    it.each(['page[limit]=1e2', 'page[limit]=2.5', 'page[offset]=-1', 'page[limit]=x'])('a malformed page value %s is refused', (query) => {
        refusal(() => decode(query));
    });

    it('a compound filter is refused unless the schema allows nesting', () => {
        const query = 'filter=or(eq(title,\'a\'),gt(count,\'1\'))';

        expect(refusal(() => decode(query)).message).toBe('Only top-level filters joined with "and" are supported.');

        const nested = defineSchema<Note>({ filters: ['title', 'count'], nested: true });

        expect(decode(query, nested).filters).toMatchObject({
            operator: 'or',
            value: [
                {
                    field: 'title',
                    operator: 'eq',
                    value: 'a',
                },
                {
                    field: 'count',
                    operator: 'gt',
                    value: 1,
                },
            ],
        });
    });

    it('an operator inside a nested filter is checked too', () => {
        const nested = defineSchema<Note>({
            filters: ['title'],
            operators: { title: ['eq'] },
            nested: true,
        });

        expect(refusal(() => decode('filter=or(eq(title,\'a\'),gt(title,\'b\'))', nested)).message).toContain('filter[title]');
    });

    it('every order ends with the key, in the direction of the last sort', () => {
        expect(decode('sort=title').sorts.value).toEqual([{ name: 'title', operator: 'ASC' }, { name: 'id', operator: 'ASC' }]);
        expect(decode('sort=title,-count').sorts.value).toEqual([
            { name: 'title', operator: 'ASC' },
            { name: 'count', operator: 'DESC' },
            { name: 'id', operator: 'DESC' },
        ]);
        expect(decode('').sorts.value).toEqual([{ name: 'id', operator: 'ASC' }]);
    });

    it('without a sort the schema\'s default order applies, then the key', () => {
        const ordered = defineSchema<Note>({
            sorts: ['title'],
            sort: { count: 'DESC' },
            key: ['parentId', 'id'],
        });

        expect(decode('', ordered).sorts.value).toEqual([
            { name: 'count', operator: 'DESC' },
            { name: 'parentId', operator: 'DESC' },
            { name: 'id', operator: 'DESC' },
        ]);
        expect(decode('sort=title', ordered).sorts.value).toEqual([
            { name: 'title', operator: 'ASC' },
            { name: 'parentId', operator: 'ASC' },
            { name: 'id', operator: 'ASC' },
        ]);
    });

    it('a sort on the key is not repeated', () => {
        const keyed = defineSchema<Note>({ sorts: ['id'] });

        expect(decode('sort=-id', keyed).sorts.value).toEqual([{ name: 'id', operator: 'DESC' }]);
    });

    it.each([
        ['a relation of the included relation', 'include=parent.parent', 'parent.parent'],
        ['a field of the included relation', 'include=parent.secret', 'parent.secret'],
        ['a deeper path', 'include=parent.parent.parent', 'parent.parent'],
    ])('an include beyond the relations the schema names is refused: %s', (_, query, path) => {
        expect(refusal(() => decode(query)).message).toContain(path);
    });

    it('a nested include the schema names is taken, with its parent', () => {
        const deep = defineSchema<Note>({ relations: ['parent', 'parent.parent' as never] });

        expect(decode('include=parent.parent', deep).relations.value.map((relation) => relation.name)).toEqual(['parent', 'parent.parent']);
    });

    it('a field selection together with an include is refused with a clear message', () => {
        expect(refusal(() => decode('fields=title&include=parent')).message).toBe('fields cannot be combined with include: select fields or include relations.');
    });

    it.each([
        'page[offset]=99999999999999999999',
        'page[limit]=99999999999999999999',
        'page[offset]=9007199254740992',
    ])('a page value above the largest safe integer is refused: %s', (query) => {
        refusal(() => decode(query));
    });
});
