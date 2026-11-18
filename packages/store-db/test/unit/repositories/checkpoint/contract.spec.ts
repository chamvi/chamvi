/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource } from 'typeorm';
import { afterAll, beforeAll } from 'vitest';
import { describeCheckpointRepositoryContract } from '@chamvi/test-kit';
import { DatabaseCheckpointRepository } from '../../../../src/repositories/checkpoint/index.ts';
import { DatabaseRunRepository } from '../../../../src/repositories/run/index.ts';
import { createTestDataSource, describePostgres, truncateRepository } from '../../../utils/database.ts';

describePostgres('postgres checkpoint', () => {
    let dataSource: DataSource;

    beforeAll(async () => {
        dataSource = await createTestDataSource();
    });

    afterAll(async () => {
        await dataSource.destroy();
    });

    describeCheckpointRepositoryContract({
        name: 'postgres',
        async create() {
            await truncateRepository(dataSource);

            return {
                runs: new DatabaseRunRepository(dataSource),
                checkpoints: new DatabaseCheckpointRepository(dataSource),
            };
        },
    });
});
