/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource } from 'typeorm';
import {
    afterAll,
    beforeAll,
    beforeEach,
    expect,
    it,
} from 'vitest';
import { AgentRevisionService, type IAgentRevisionService } from '@chamvi/core';
import { DatabaseAgentRevisionRepository } from '../../../../src/repositories/agent-revision/index.ts';
import { createTestDataSource, describePostgres, truncateRepository } from '../../../utils/database.ts';

describePostgres('AgentRevisionService on PostgreSQL', () => {
    let dataSource: DataSource;
    let revisions: IAgentRevisionService;

    beforeAll(async () => {
        dataSource = await createTestDataSource();
    });

    beforeEach(async () => {
        await truncateRepository(dataSource);
        revisions = new AgentRevisionService({ repository: new DatabaseAgentRevisionRepository(dataSource) });
    });

    afterAll(async () => {
        await dataSource.destroy();
    });

    it('returns from save what the next read returns, also for a replacing save', async () => {
        const saved = await revisions.save({
            agent: 'a',
            hash: 'h1',
            changedAt: new Date(1_000),
        });

        expect(saved).toStrictEqual({
            agent: 'a',
            hash: 'h1',
            changedAt: new Date(1_000),
        });
        expect(saved).toStrictEqual(await revisions.findOne('a'));

        const replaced = await revisions.save({
            agent: 'a',
            hash: 'h2',
            changedAt: new Date(2_000),
        });

        expect(replaced).toStrictEqual({
            agent: 'a',
            hash: 'h2',
            changedAt: new Date(2_000),
        });
        expect(replaced).toStrictEqual(await revisions.findOne('a'));
        expect(await revisions.find()).toStrictEqual([replaced]);
    });

    it('find orders by agent code point (COLLATE "C"), not by the database locale', async () => {
        for (const agent of ['b', 'a_b', 'a-b', 'a', 'B']) {
            await revisions.save({
                agent,
                hash: 'h',
                changedAt: new Date(1_000),
            });
        }

        expect((await revisions.find()).map((revision) => revision.agent)).toEqual(['B', 'a', 'a-b', 'a_b', 'b']);
    });

    it('delete removes the marker and ignores a missing one', async () => {
        await revisions.save({
            agent: 'a',
            hash: 'h1',
            changedAt: new Date(1_000),
        });
        await revisions.delete('a');
        await expect(revisions.delete('a')).resolves.toBeUndefined();
        expect(await revisions.find()).toEqual([]);
    });

    it('concurrent saves of one agent all resolve and leave one row', async () => {
        const results = await Promise.all(Array.from({ length: 20 }, (_, i) => revisions.save({
            agent: 'a',
            hash: `h${i}`,
            changedAt: new Date(1_000),
        })));

        expect(results.map((result) => result.hash)).toEqual(Array.from({ length: 20 }, (_, i) => `h${i}`));

        const [{ count }] = await dataSource.query('SELECT count(*)::int AS count FROM chamvi_agent_revisions WHERE agent = $1', ['a']);

        expect(count).toBe(1);
    });
});
