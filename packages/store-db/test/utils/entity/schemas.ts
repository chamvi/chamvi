/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { EntitySchema } from 'typeorm';
import type { EntityContractChild, EntityContractParent, EntityContractRecord } from '@chamvi/test-kit';

export type FixtureDriver = 'postgres' | 'better-sqlite3';

/** The stored shape of a claim: the public `claim` object as two flat columns. */
export type ClaimRow = {
    id: string;
    name: string;
    claimOwner: string | null;
    claimExpiresAt: Date | null;
};

/** The public shape of a claim. */
export type Claim = {
    id: string;
    name: string;
    claim?: {
        owner: string;
        expiresAt: Date;
    };
};

export type FixtureSchemas = {
    parent: EntitySchema<EntityContractParent>;
    child: EntitySchema<EntityContractChild>;
    claim: EntitySchema<ClaimRow>;
    record: EntitySchema<EntityContractRecord>;
};

/**
 * The fixture tables of the entity contract on their own names, never a
 * store table: a parent (`name` unique, `counter` not negative), a child referencing it, a claim
 * whose public value nests two columns, and a record with an upsert key
 * (`(scope, name)` unique). Built per driver, since a
 * date column has no type both drivers accept.
 */
export function createFixtureSchemas(driver: FixtureDriver): FixtureSchemas {
    const date = driver === 'postgres' ? 'timestamp with time zone' : 'datetime';

    const parent = new EntitySchema<EntityContractParent>({
        name: 'fixture_parent',
        tableName: 'test_entity_parents',
        columns: {
            id: { type: 'uuid', primary: true },
            name: {
                type: 'varchar',
                length: 64,
                unique: true,
            },
            note: {
                type: 'varchar',
                length: 64,
                nullable: true,
            },
            counter: { type: 'integer' },
            label: { type: 'varchar', length: 64 },
            createdAt: { name: 'created_at', type: date },
        },
        checks: [{ name: 'parent_counter_check', expression: '"counter" >= 0' }],
    });

    const child = new EntitySchema<EntityContractChild>({
        name: 'fixture_child',
        tableName: 'test_entity_children',
        columns: {
            id: { type: 'uuid', primary: true },
            parentId: { name: 'parent_id', type: 'uuid' },
            label: { type: 'varchar', length: 64 },
        },
        relations: {
            parent: {
                type: 'many-to-one',
                target: 'fixture_parent',
                joinColumn: { name: 'parent_id', referencedColumnName: 'id' },
                nullable: false,
                onDelete: 'NO ACTION',
            },
        },
    } as never);

    const claim = new EntitySchema<ClaimRow>({
        name: 'fixture_claim',
        tableName: 'test_entity_claims',
        columns: {
            id: { type: 'uuid', primary: true },
            name: { type: 'varchar', length: 64 },
            claimOwner: {
                name: 'claim_owner',
                type: 'varchar',
                length: 64,
                nullable: true,
            },
            claimExpiresAt: {
                name: 'claim_expires_at',
                type: date,
                nullable: true,
            },
        },
    });

    const record = new EntitySchema<EntityContractRecord>({
        name: 'fixture_record',
        tableName: 'test_entity_records',
        columns: {
            id: { type: 'uuid', primary: true },
            scope: { type: 'varchar', length: 64 },
            name: { type: 'varchar', length: 64 },
            value: { type: 'integer' },
        },
        uniques: [{ columns: ['scope', 'name'] }],
    });

    return {
        parent,
        child,
        claim,
        record,
    };
}
