/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { afterAll, beforeAll, describe } from 'vitest';
import { describeEntityRepositoryContract } from '@chamvi/test-kit';
import { BIND_PARAMETER_LIMITS } from '../../../src/entity/constants.ts';
import { postgres } from '../../utils/database.ts';
import { openFixtureDataSource } from '../../utils/entity/data-source.ts';
import type { FixtureDataSource } from '../../utils/entity/data-source.ts';
import { createFixtureRepositories } from '../../utils/entity/repositories.ts';
import type { FixtureDriver } from '../../utils/entity/schemas.ts';

const drivers: {
    name: string;
    driver: FixtureDriver;
    serialized: boolean;
    parameterLimit?: number;
    guard?: boolean;
    skip: boolean
}[] = [
    {
        name: 'postgres',
        driver: 'postgres',
        serialized: false,
        skip: !postgres,
    },
    {
        name: 'better-sqlite3',
        driver: 'better-sqlite3',
        serialized: true,
        parameterLimit: BIND_PARAMETER_LIMITS['better-sqlite3'],
        skip: false,
    },
    {
        // as an app's database hands it out: every use of the data source queued
        name: 'better-sqlite3 (guarded)',
        driver: 'better-sqlite3',
        serialized: true,
        guard: true,
        skip: false,
    },
];

describe.each(drivers)('entity repository adapter on $name', ({
    name,
    driver,
    serialized,
    parameterLimit,
    guard,
    skip,
}) => {
    let fixture: FixtureDataSource;

    beforeAll(async () => {
        if (!skip) {
            fixture = await openFixtureDataSource(driver, { guard });
        }
    });

    afterAll(async () => {
        await fixture?.dataSource.destroy();
    });

    describe.skipIf(skip)(name, () => {
        describeEntityRepositoryContract({
            name,
            serialized,
            parameterLimit,
            async create() {
                await fixture.clear();

                const {
                    parents,
                    children,
                    records,
                } = createFixtureRepositories(fixture);

                return {
                    parents,
                    children,
                    records,
                };
            },
        });
    });
});
