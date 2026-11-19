/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { beforeEach, describe } from 'vitest';
import { registerEntityQueryCases } from './queries.ts';
import { registerEntityRowCases } from './rows.ts';
import { registerEntityTransactionCases } from './transactions.ts';
import { registerEntityUpsertCases } from './upserts.ts';
import { registerEntityWhereCases } from './wheres.ts';
import type { EntityContractRepositories, EntityRepositoryContractInput } from './types.ts';

/**
 * The storage contract of an `IEntityRepository` driver, asserted through
 * the port only. `create()` returns fresh, empty repositories of the two
 * fixtures on one store: the parent labelled `parent` (key `id`, `name`
 * unique), the child labelled `child` (key `id`, `parentId` references the
 * parent's `id`).
 */
export function describeEntityRepositoryContract(input: EntityRepositoryContractInput): void {
    describe(`entity repository contract: ${input.name}`, () => {
        const repositories = {} as EntityContractRepositories;

        beforeEach(async () => {
            ({
                parents: repositories.parents,
                children: repositories.children,
                records: repositories.records,
            } = await input.create());
        });

        registerEntityRowCases(repositories);
        registerEntityQueryCases(repositories);
        registerEntityTransactionCases(repositories, input);
        registerEntityUpsertCases(repositories);
        registerEntityWhereCases(repositories);
    });
}
