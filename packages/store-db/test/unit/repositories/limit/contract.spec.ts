/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource } from 'typeorm';
import { afterAll, beforeAll } from 'vitest';
import { describeLimitRepositoryContract } from '@chamvi/test-kit';
import { DatabaseLimitRepository } from '../../../../src/repositories/limit/index.ts';
import {
    createTestDataSource,
    describePostgres,
    truncateRepository,
    untilLockWait,
} from '../../../utils/database.ts';

describePostgres('postgres limit use', () => {
    let dataSource: DataSource;

    beforeAll(async () => {
        dataSource = await createTestDataSource();
    });

    afterAll(async () => {
        await dataSource.destroy();
    });

    describeLimitRepositoryContract({
        name: 'postgres',
        async create() {
            await truncateRepository(dataSource);

            return new DatabaseLimitRepository(dataSource);
        },
        untilBlocked: () => untilLockWait(dataSource),
    });
});
