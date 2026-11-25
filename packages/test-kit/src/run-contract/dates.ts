/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */
import {
    and,
    defineQuery,
    eq,
    gte,
    lte,
} from '@rapiq/core';
import { expect, it } from 'vitest';
import { RunStatus } from '@chamvi/store';
import type { IRunRepository } from '@chamvi/store';
import { makeRun, testUuid } from '../fixture/helpers.ts';
import { APPROVAL } from './constants.ts';
import { idsOf, insert } from './helpers.ts';

/** The createdAt bounds of the run contract: the run list's date range, compared as instants on every driver. */
export function registerRunDateCases(runs: () => IRunRepository): void {
    it('findMany and findByWaitKind filter createdAt by instant: inclusive bounds, any offset, with other filters', async () => {
        await insert(runs(), makeRun(testUuid('r1'), { createdAt: new Date(1_000) }));
        await insert(runs(), makeRun(testUuid('r2'), { createdAt: new Date(2_000) }));
        await insert(runs(), makeRun(testUuid('r3'), { agent: 'b', createdAt: new Date(3_000) }));
        await insert(runs(), makeRun(testUuid('r4'), {
            status: RunStatus.WAITING,
            waiting: APPROVAL,
            createdAt: new Date(4_000),
        }));

        const sorts = { createdAt: 'ASC', id: 'ASC' } as const;
        const between = (lower: Date | string, upper: Date | string) => and(gte('createdAt', lower), lte('createdAt', upper));

        expect(idsOf((await runs().findMany(defineQuery({ filters: between(new Date(2_000), new Date(3_000)), sorts }))).data))
            .toEqual([testUuid('r2'), testUuid('r3')]);
        // ISO 8601 instants with an offset name the same moments: 1970-01-01T00:00:02Z and 00:00:03.999Z
        expect(idsOf((await runs().findMany(defineQuery({
            filters: between('1970-01-01T01:00:02.000+01:00', '1970-01-01T00:00:03.999Z'),
            sorts,
        }))).data)).toEqual([testUuid('r2'), testUuid('r3')]);
        expect(idsOf((await runs().findMany(defineQuery({ filters: gte('createdAt', '1970-01-01T00:00:03.000Z'), sorts }))).data))
            .toEqual([testUuid('r3'), testUuid('r4')]);
        expect(idsOf((await runs().findMany(defineQuery({ filters: lte('createdAt', '1970-01-01T00:00:01.999Z'), sorts }))).data))
            .toEqual([testUuid('r1')]);
        expect(idsOf((await runs().findMany(defineQuery({ filters: and(eq('agent', 'a'), between(new Date(1_000), new Date(3_000))), sorts }))).data))
            .toEqual([testUuid('r1'), testUuid('r2')]);
        expect((await runs().findMany(defineQuery({ filters: between(new Date(3_001), new Date(3_999)) }))).meta.total).toBe(0);
        expect(idsOf((await runs().findByWaitKind('approval', defineQuery({ filters: between(new Date(4_000), new Date(4_000)) }))).data))
            .toEqual([testUuid('r4')]);
        expect((await runs().findByWaitKind('approval', defineQuery({ filters: lte('createdAt', new Date(3_999)) }))).meta.total).toBe(0);
    });
}
