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
import { EffectService } from '@chamvi/core';
import { DatabaseEffectRepository } from '../../../../src/repositories/effect/index.ts';
import { createTestDataSource, describePostgres, truncateRepository } from '../../../utils/database.ts';

describePostgres('EffectService on PostgreSQL', () => {
    let dataSource: DataSource;
    let effects: EffectService;

    beforeAll(async () => {
        dataSource = await createTestDataSource();
    });

    beforeEach(async () => {
        await truncateRepository(dataSource);
        effects = new EffectService({ repository: new DatabaseEffectRepository(dataSource) });
    });

    afterAll(async () => {
        await dataSource.destroy();
    });

    it('returns from save what the next read returns; an undefined result is stored as null', async () => {
        const saved = await effects.save('k', { at: new Date(1_000), list: [1] });

        // jsonb keeps a Date as its ISO text: the returned value says so too
        expect(saved).toStrictEqual({ result: { at: '1970-01-01T00:00:01.000Z', list: [1] } });
        expect(saved).toStrictEqual(await effects.findOne('k'));
        expect(await effects.save('u', undefined)).toStrictEqual({ result: null });
        expect(await effects.findOne('u')).toStrictEqual({ result: null });
    });

    it('concurrent saves of one key all resolve and leave one row', async () => {
        const results = await Promise.all(Array.from({ length: 20 }, (_, i) => effects.save('k', i)));

        expect(results.map((result) => result.result)).toEqual(Array.from({ length: 20 }, (_, i) => i));

        const [{ count }] = await dataSource.query('SELECT count(*)::int AS count FROM chamvi_effects WHERE key = $1', ['k']);

        expect(count).toBe(1);
    });
});
