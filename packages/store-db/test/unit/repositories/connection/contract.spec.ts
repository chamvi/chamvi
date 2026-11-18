/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource } from 'typeorm';
import { afterAll, beforeAll } from 'vitest';
import { describeConnectionRepositoryContract } from '@chamvi/test-kit';
import { DatabaseConnectionRepository } from '../../../../src/repositories/connection/index.ts';
import { DatabaseLockRepository } from '../../../../src/repositories/lock/index.ts';
import {
    createTestDataSource,
    describePostgres,
    truncateRepository,
    untilLockWait,
} from '../../../utils/database.ts';

describePostgres('postgres connection', () => {
    let dataSource: DataSource;

    beforeAll(async () => {
        dataSource = await createTestDataSource();
    });

    afterAll(async () => {
        await dataSource.destroy();
    });

    describeConnectionRepositoryContract({
        name: 'postgres',
        async create() {
            await truncateRepository(dataSource);

            return {
                repository: new DatabaseConnectionRepository(dataSource),
                locks: new DatabaseLockRepository(dataSource),
            };
        },
        untilBlocked: () => untilLockWait(dataSource),
    });
});
