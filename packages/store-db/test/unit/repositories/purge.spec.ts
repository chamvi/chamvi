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
    expect,
    it,
} from 'vitest';
import { ControllableClock, testUuid } from '@chamvi/test-kit';
import { createTestDataSource, describePostgres } from '../../utils/database.ts';
import { createTestServices } from '../../utils/store.ts';

describePostgres('purgeExpired of the lock and idempotency services', () => {
    let dataSource: DataSource;

    beforeAll(async () => {
        dataSource = await createTestDataSource();
    });

    afterAll(async () => {
        await dataSource.destroy();
    });

    it('removes expired keys and locks only, never effects', async () => {
        const clock = new ControllableClock(new Date(0));
        const store = createTestServices({ dataSource, clock });

        await store.idempotencyService.claim('s', 'k1', testUuid('r1'), 1_000);
        await store.idempotencyService.claim('s', 'k2', testUuid('r2'), 5_000);
        await store.lockService.acquire('l1', 'o', 1_000);
        await store.lockService.acquire('l2', 'o', 5_000);
        await store.effectService.save('e', 1);

        clock.advance(1_000);
        await expect(store.idempotencyService.purgeExpired()).resolves.toBe(1);
        await expect(store.lockService.purgeExpired()).resolves.toBe(1);
        await expect(store.idempotencyService.claim('s', 'k2', testUuid('other'), 1_000)).resolves.toEqual({ created: false, runId: testUuid('r2') });
        await expect(store.lockService.acquire('l2', 'x', 1)).resolves.toBe(false);
        await expect(store.effectService.findOne('e')).resolves.toEqual({ result: 1 });

        await expect(store.idempotencyService.purgeExpired(new Date(5_000))).resolves.toBe(1);
        await expect(store.lockService.purgeExpired(new Date(5_000))).resolves.toBe(1);
    });
});
