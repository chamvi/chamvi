/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/* eslint-disable max-classes-per-file */
import { Column, ColumnTypeUndefinedError, PrimaryColumn } from 'typeorm';
import type { ColumnOptions } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { findUntypedColumns } from '../../../src/database/index.ts';

/** Applies `@Column()` as the compiler would, with `type` as the emitted `design:type` (none when undefined). */
function column(target: object, property: string, type: unknown, options: ColumnOptions = {}): void {
    if (type !== undefined) {
        Reflect.defineMetadata('design:type', type, target, property);
    }

    (Column(options) as PropertyDecorator)(target, property);
}

describe('findUntypedColumns', () => {
    it('names a column whose type was derived as Object (a union such as Date | null)', () => {
        class LateEntity {}

        (PrimaryColumn({ type: 'varchar', length: 36 }) as PropertyDecorator)(LateEntity.prototype, 'id');
        column(LateEntity.prototype, 'when', Object, { nullable: true });
        column(LateEntity.prototype, 'at', Date);
        column(LateEntity.prototype, 'note', Object, { type: 'text' });

        expect(findUntypedColumns([LateEntity])).toEqual([{ entity: 'LateEntity', property: 'when' }]);
    });

    it('reads the columns of a parent class too', () => {
        class BaseEntity {}
        class ChildEntity extends BaseEntity {}

        column(BaseEntity.prototype, 'stamp', Object);
        column(ChildEntity.prototype, 'title', String);

        expect(findUntypedColumns([ChildEntity])).toEqual([{ entity: 'ChildEntity', property: 'stamp' }]);
    });

    it('finds nothing for typed columns', () => {
        class TypedEntity {}

        column(TypedEntity.prototype, 'at', Date);
        column(TypedEntity.prototype, 'name', undefined, { type: 'varchar', length: 64 });

        expect(findUntypedColumns([TypedEntity])).toEqual([]);
    });

    it('TypeORM itself refuses a column without decorator metadata when the decorator runs, naming it', () => {
        class BareEntity {}

        expect(() => column(BareEntity.prototype, 'publishedAt', undefined, { nullable: true }))
            .toThrow(ColumnTypeUndefinedError);
        expect(() => column(BareEntity.prototype, 'publishedAt', undefined, { nullable: true }))
            .toThrow(/BareEntity#publishedAt/);
    });
});
