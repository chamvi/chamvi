/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource } from 'typeorm';
import { afterAll, beforeAll } from 'vitest';
import { describeAgentRevisionRepositoryContract } from '@chamvi/test-kit';
import { DatabaseAgentRevisionRepository } from '../../../../src/repositories/agent-revision/index.ts';
import { createTestDataSource, describePostgres, truncateRepository } from '../../../utils/database.ts';

describePostgres('postgres agent revision', () => {
    let dataSource: DataSource;

    beforeAll(async () => {
        dataSource = await createTestDataSource();
    });

    afterAll(async () => {
        await dataSource.destroy();
    });

    describeAgentRevisionRepositoryContract({
        name: 'postgres',
        async create() {
            await truncateRepository(dataSource);

            return new DatabaseAgentRevisionRepository(dataSource);
        },
    });
});
