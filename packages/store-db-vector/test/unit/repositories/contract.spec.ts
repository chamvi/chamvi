/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { KnowledgeService } from '@chamvi/knowledge';
import { ControllableClock, describeKnowledgeRepositoryContract } from '@chamvi/test-kit';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll } from 'vitest';
import { DatabaseKnowledgeRepository } from '../../../src/repositories/index.ts';
import { createTestDataSource, describePostgres, truncateTables } from '../../utils/database.ts';

describePostgres('postgres knowledge', () => {
    let dataSource: DataSource;

    beforeAll(async () => {
        dataSource = await createTestDataSource();
    });

    afterAll(async () => {
        await dataSource.destroy();
    });

    describeKnowledgeRepositoryContract({
        name: 'postgres',
        async create() {
            await truncateTables(dataSource);

            return new KnowledgeService({
                repository: new DatabaseKnowledgeRepository(dataSource),
                clock: new ControllableClock(new Date('2026-11-01T00:00:00Z')),
            });
        },
    });
});
