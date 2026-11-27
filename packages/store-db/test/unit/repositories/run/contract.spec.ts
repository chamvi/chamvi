/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { EntityRelationError } from '@chamvi/errors';
import type { DataSource } from 'typeorm';
import {
    afterAll,
    beforeAll,
    expect,
    it,
} from 'vitest';
import { ConversationService, systemClock } from '@chamvi/core';
import { describeRunRepositoryContract, testUuid } from '@chamvi/test-kit';
import { DatabaseRunRepository } from '../../../../src/repositories/run/index.ts';
import { DatabaseConversationRepository } from '../../../../src/repositories/conversation/index.ts';
import { createTestDataSource, describePostgres, truncateRepository } from '../../../utils/database.ts';
import { makeRun } from '../../../utils/run.ts';

describePostgres('postgres runs', () => {
    let dataSource: DataSource;

    beforeAll(async () => {
        dataSource = await createTestDataSource();
    });

    afterAll(async () => {
        await dataSource.destroy();
    });

    describeRunRepositoryContract({
        name: 'postgres',
        async create() {
            await truncateRepository(dataSource);

            return new DatabaseRunRepository(dataSource);
        },
    });

    it('stores the conversation binding and names a missing conversation scope', async () => {
        await truncateRepository(dataSource);

        const runs = new DatabaseRunRepository(dataSource);
        const identity = {
            agent: 'a',
            channel: 'chat',
            account: 'main',
            chat: 'room',
            audience: 'direct',
        };
        const conversations = new ConversationService({ repository: new DatabaseConversationRepository(dataSource), clock: systemClock });
        const scope = await conversations.resolve(identity);
        const run = makeRun(testUuid('r1'), { conversation: { scope, text: 'hello' } });

        await runs.save(runs.create(run));
        expect(await runs.findOneById(testUuid('r1'))).toEqual(run);

        const missing = makeRun(testUuid('r2'), {
            conversation: {
                scope: { ...scope, id: testUuid('nope') },
                text: 'hello',
            },
        });
        const error = await runs.save(runs.create(missing)).catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(EntityRelationError);
        expect(error).toMatchObject({ entity: 'run', relation: 'conversation' });
    });
});
