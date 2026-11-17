/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource } from 'typeorm';
import { afterAll, beforeAll } from 'vitest';
import { describeStateRepositoryContract } from '@chamvi/test-kit';
import { DatabaseStateDocumentRepository, DatabaseStateRepository } from '../../../src/state/index.ts';
import { createTestDataSource, describePostgres, truncateRepository } from '../../utils/database.ts';

describePostgres('postgres state', () => {
    let dataSource: DataSource;

    beforeAll(async () => {
        dataSource = await createTestDataSource();
    });

    afterAll(async () => {
        await dataSource.destroy();
    });

    describeStateRepositoryContract({
        name: 'postgres',
        async create() {
            await truncateRepository(dataSource);

            return {
                entries: new DatabaseStateRepository(dataSource),
                documents: new DatabaseStateDocumentRepository(dataSource),
            };
        },
    });
});
