/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    DataSource,
    EntityMetadata,
    EntityTarget,
    ObjectLiteral,
} from 'typeorm';
import { DatabaseOptionsError } from '../error/options.ts';
import type { EntityListSchema } from './types.ts';

/** The metadata a dotted path ends on: each segment but the last a relation; undefined when one is not. */
function ownerOf(metadata: EntityMetadata, path: string): { metadata: EntityMetadata; property: string } | undefined {
    const segments = path.split('.');
    let current = metadata;

    for (const segment of segments.slice(0, -1)) {
        const relation = current.findRelationWithPropertyPath(segment);

        if (!relation) {
            // an embedded object's column is one path of its owner
            return current.findColumnWithPropertyPath(path) ? { metadata: current, property: path } : undefined;
        }

        current = relation.inverseEntityMetadata;
    }

    return { metadata: current, property: segments.at(-1)! };
}

/** A column of the entity (or of a related one, through a dotted path), never a relation itself. */
function isColumn(metadata: EntityMetadata, path: string): boolean {
    const owner = ownerOf(metadata, path);

    return owner !== undefined &&
        owner.metadata.findRelationWithPropertyPath(owner.property) === undefined &&
        owner.metadata.findColumnWithPropertyPath(owner.property) !== undefined;
}

/** A relation of the entity, nested ones through a dotted path. */
function isRelation(metadata: EntityMetadata, path: string): boolean {
    const owner = ownerOf(metadata, path);

    return owner !== undefined && owner.metadata.findRelationWithPropertyPath(owner.property) !== undefined;
}

function nameOf(schema: EntityListSchema, index: number): string {
    if (schema.name) {
        return schema.name;
    }

    if (typeof schema.entity === 'string') {
        return schema.entity;
    }

    if (typeof schema.entity === 'function' && schema.entity.name) {
        return schema.entity.name;
    }

    return `#${index + 1}`;
}

/**
 * Checks each list schema against its entity's metadata in `dataSource`
 * (initialized: TypeORM builds the metadata when it connects; nothing is
 * queried): every field, filter, sort, default sort and key field must be
 * a column of the entity (a dotted path through its relations reaches a
 * column of a related entity), every relation a relation of it. A schema
 * that names no entity, an entity the data source does not hold, or a
 * name it lacks is a `DatabaseOptionsError` naming the schema and the
 * name.
 */
export function validateEntitySchemas(dataSource: DataSource, schemas: readonly EntityListSchema[]): void {
    schemas.forEach((schema, index) => {
        const name = nameOf(schema, index);

        if (schema.entity === undefined) {
            throw new DatabaseOptionsError(`The list schema "${name}" names no entity: give it the entity it lists.`);
        }

        const target = schema.entity as EntityTarget<ObjectLiteral>;

        if (!dataSource.hasMetadata(target)) {
            throw new DatabaseOptionsError(`The list schema "${name}" names an entity the database does not hold.`);
        }

        const metadata = dataSource.getMetadata(target);
        const columns: Array<[string, readonly string[]]> = [
            ['field', schema.fields],
            ['filter', schema.filters],
            ['sort', schema.sorts],
            ['default sort', Object.keys(schema.sort)],
            ['key field', schema.key],
        ];

        for (const [kind, paths] of columns) {
            const missing = paths.find((path) => !isColumn(metadata, path));

            if (missing !== undefined) {
                throw new DatabaseOptionsError(
                    `The list schema "${name}" names the ${kind} "${missing}", which is no column of the entity "${metadata.name}".`,
                );
            }
        }

        const relation = schema.relations.find((path) => !isRelation(metadata, path));

        if (relation !== undefined) {
            throw new DatabaseOptionsError(
                `The list schema "${name}" names the relation "${relation}", which is no relation of the entity "${metadata.name}".`,
            );
        }
    });
}
