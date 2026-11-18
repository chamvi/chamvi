/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource } from 'typeorm';
import { afterAll, beforeAll } from 'vitest';
import { describeArtifactRepositoryContract } from '@chamvi/test-kit';
import { DatabaseArtifactRepository } from '../../../../src/repositories/artifact/index.ts';
import { createTestDataSource, describePostgres, truncateRepository } from '../../../utils/database.ts';

describePostgres('postgres artifact', () => {
    let dataSource: DataSource;

    beforeAll(async () => {
        dataSource = await createTestDataSource();
    });

    afterAll(async () => {
        await dataSource.destroy();
    });

    describeArtifactRepositoryContract({
        name: 'postgres',
        async create() {
            await truncateRepository(dataSource);

            return new DatabaseArtifactRepository(dataSource);
        },
    });
});
