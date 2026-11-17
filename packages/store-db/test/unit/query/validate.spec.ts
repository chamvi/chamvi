/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    afterAll,
    beforeAll,
    describe,
    expect,
    it,
} from 'vitest';
import { DatabaseOptionsError } from '../../../src/error/index.ts';
import { validateEntitySchemas } from '../../../src/query/index.ts';
import type { EntityListSchema } from '../../../src/query/index.ts';
import { openFixtureDataSource } from '../../utils/entity/data-source.ts';
import type { FixtureDataSource } from '../../utils/entity/data-source.ts';

/** A list schema as `defineSchema()` of `@chamvi/http` builds one: the check reads it structurally. */
function schemaOf(overrides: Partial<EntityListSchema>): EntityListSchema {
    return {
        name: 'children',
        entity: 'fixture_child',
        fields: ['id', 'label'],
        filters: ['label', 'parentId'],
        sorts: ['label'],
        sort: { label: 'ASC' },
        key: ['id'],
        relations: ['parent'],
        ...overrides,
    };
}

function failure(fixture: FixtureDataSource, schema: EntityListSchema): string {
    try {
        validateEntitySchemas(fixture.dataSource, [schema]);
    } catch (error) {
        expect(error).toBeInstanceOf(DatabaseOptionsError);

        return (error as Error).message;
    }

    return expect.unreachable('expected a refusal');
}

describe('validateEntitySchemas', () => {
    let fixture: FixtureDataSource;

    beforeAll(async () => {
        fixture = await openFixtureDataSource('better-sqlite3', { guard: true });
    });

    afterAll(async () => {
        await fixture?.dataSource.destroy();
    });

    it('accepts schemas whose fields, filters, sorts, key and relations the entity has, by name or by target', () => {
        expect(() => validateEntitySchemas(fixture.dataSource, [
            schemaOf({}),
            schemaOf({
                entity: fixture.schemas.parent,
                relations: [],
                filters: ['name', 'createdAt'],
                fields: [],
                sorts: ['createdAt'],
                sort: {},
            }),
        ])).not.toThrow();
    });

    it.each([
        ['a field', { fields: ['id', 'secret'] }, 'secret'],
        ['a filter', { filters: ['secret'] }, 'secret'],
        ['a sort', { sorts: ['secret'] }, 'secret'],
        ['a default sort', { sort: { secret: 'DESC' } }, 'secret'],
        ['a key', { key: ['secret'] }, 'secret'],
        ['a relation', { relations: ['other'] }, 'other'],
    ] as const)('a schema naming %s the entity lacks is refused, naming the schema and the field', (_, overrides, field) => {
        const message = failure(fixture, schemaOf(overrides as Partial<EntityListSchema>));

        expect(message).toContain('"children"');
        expect(message).toContain(`"${field}"`);
    });

    it('a relation that is a column, not a relation of the entity, is refused', () => {
        expect(failure(fixture, schemaOf({ relations: ['label'] }))).toContain('"label"');
    });

    it('a filter on the relation itself is refused: a relation filters by its join column', () => {
        expect(failure(fixture, schemaOf({ filters: ['parent'] }))).toContain('"parent"');
    });

    it('a schema of an entity the database does not hold, or of none, is refused', () => {
        expect(failure(fixture, schemaOf({ entity: 'unknown_entity' }))).toContain('"children"');

        const unnamed = failure(fixture, schemaOf({ name: undefined, entity: undefined }));

        expect(unnamed).toContain('names no entity');
    });
});
