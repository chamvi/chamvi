/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IApp } from '@chamvi/app';
import { systemClock } from '@chamvi/core';
import { KnowledgeService } from '@chamvi/knowledge';
import { mockEmbeddingModel } from '@chamvi/test-kit';
import type { DataSource } from 'typeorm';
import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { DatabaseKnowledgeRepository } from '@chamvi/store-db-vector';
import { createSupportApp } from '../fixtures/readme-example.ts';
import {
    createTestDataSource,
    createTestDatabase,
    describePostgres,
    postgres,
} from '../utils/database.ts';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const cleanups: Array<() => Promise<unknown>> = [];

afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) {
        await cleanup();
    }
});

/** A loopback port free right now. */
function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = createServer();

        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            const port = typeof address === 'object' && address ? address.port : 0;

            server.close(() => resolve(port));
        });
    });
}

describe('README example', () => {
    it('is the code of test/fixtures/readme-example.ts', () => {
        const readme = read('../../README.md');
        const blocks = readme.matchAll(/```typescript\n([\s\S]*?)```/g).map((m) => m[1]).toArray();

        expect(blocks).toContain(read('../fixtures/readme-example.ts'));
    });
});

describePostgres('README example on PostgreSQL', () => {
    it('indexes the handbook into the vector tables of DATABASE_URL', async () => {
        const handbook = await mkdtemp(join(tmpdir(), 'chamvi-vector-readme-'));

        cleanups.push(() => rm(handbook, { recursive: true, force: true }));
        await writeFile(join(handbook, 'refunds.md'), '# Refunds\n\nA refund is paid within 30 days.\n');

        const database = await createTestDatabase();
        const {
            username,
            password,
            host,
            port,
        } = postgres!;
        const app: IApp = createSupportApp({ handbook, embedding: mockEmbeddingModel() });

        cleanups.push(() => app.stop());
        await app.start({
            env: {
                HOST: '127.0.0.1',
                CHAMVI_LOG_LEVEL: 'error',
                PORT: String(await freePort()),
                CHAMVI_TOKENS: JSON.stringify([{
                    value: 'a-static-token-of-length',
                    id: 'ops',
                    permissions: '*',
                }]),
                DATABASE_URL: `postgres://${username}:${password}@${host}:${port}/${database}`,
            },
        });

        const dataSource: DataSource = await createTestDataSource({ database, migrate: false });

        cleanups.push(() => dataSource.destroy());

        const service = new KnowledgeService({ repository: new DatabaseKnowledgeRepository(dataSource), clock: systemClock });

        await vi.waitFor(async () => {
            expect(await service.findOneCollection('handbook')).toMatchObject({ status: 'ready', trusted: true });
        }, { timeout: 15_000 });
        expect(await service.findOneDocument('handbook', 'refunds.md')).toMatchObject({ status: 'ready', title: 'Refunds' });
    });
});
