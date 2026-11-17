/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource } from 'typeorm';
import { afterAll, beforeAll } from 'vitest';
import { describeStepRepositoryContract } from '@chamvi/test-kit';
import { DatabaseRunRepository } from '../../../src/run/index.ts';
import { DatabaseStepRepository } from '../../../src/step/index.ts';
import { createTestDataSource, describePostgres, truncateRepository } from '../../utils/database.ts';

describePostgres('postgres steps', () => {
    let dataSource: DataSource;

    beforeAll(async () => {
        dataSource = await createTestDataSource();
    });

    afterAll(async () => {
        await dataSource.destroy();
    });

    describeStepRepositoryContract({
        name: 'postgres',
        async create() {
            await truncateRepository(dataSource);

            return {
                runs: new DatabaseRunRepository(dataSource),
                steps: new DatabaseStepRepository(dataSource),
            };
        },
    });
});
