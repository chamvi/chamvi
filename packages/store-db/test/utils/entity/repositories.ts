/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { EntityContractChild, EntityContractParent, EntityContractRecord } from '@chamvi/test-kit';
import type { EntityLockMode } from '../../../src/entity/index.ts';
import type { FixtureDataSource } from './data-source.ts';
import { FixtureRepository } from './repository.ts';
import type { Claim, ClaimRow } from './schemas.ts';

export type FixtureRepositories = {
    parents: FixtureRepository<EntityContractParent>;
    children: FixtureRepository<EntityContractChild>;
    claims: FixtureRepository<Claim, ClaimRow>;
    records: FixtureRepository<EntityContractRecord>;
};

/** The claim's public value as its two columns; an absent claim is absent columns. */
export function claimToEntity(value: Partial<Claim>): Partial<ClaimRow> {
    return {
        id: value.id,
        name: value.name,
        claimOwner: value.claim?.owner,
        claimExpiresAt: value.claim ? new Date(value.claim.expiresAt) : undefined,
    };
}

export function claimFromEntity(row: ClaimRow): Claim {
    return {
        id: row.id,
        name: row.name,
        ...(row.claimOwner !== null && row.claimExpiresAt !== null ?
            { claim: { owner: row.claimOwner, expiresAt: new Date(row.claimExpiresAt) } } :
            {}),
    };
}

export function createFixtureRepositories(fixture: FixtureDataSource, lock?: EntityLockMode): FixtureRepositories {
    const { dataSource, schemas } = fixture;
    const related = [
        { target: schemas.parent, entity: 'parent' },
        { target: schemas.child, entity: 'child' },
    ];

    return {
        parents: new FixtureRepository<EntityContractParent>(dataSource.getRepository(schemas.parent), {
            entity: 'parent',
            alias: 'parent',
            target: schemas.parent,
            related,
            ...(lock ? { lock } : {}),
        }),
        children: new FixtureRepository<EntityContractChild>(dataSource.getRepository(schemas.child), {
            entity: 'child',
            alias: 'child',
            target: schemas.child,
            related,
        }),
        claims: new FixtureRepository<Claim, ClaimRow>(dataSource.getRepository(schemas.claim), {
            entity: 'claim',
            alias: 'claim',
            target: schemas.claim,
            toEntity: claimToEntity,
            fromEntity: claimFromEntity,
            fields: {
                'claim.owner': 'claimOwner',
                'claim.expiresAt': 'claimExpiresAt',
            },
        }),
        records: new FixtureRepository<EntityContractRecord>(dataSource.getRepository(schemas.record), {
            entity: 'record',
            alias: 'record',
            target: schemas.record,
            upsertKey: ['scope', 'name'],
        }),
    };
}
