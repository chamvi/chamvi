/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { aggregateStatus } from '../../../src/scheduler/helpers.ts';

describe('aggregateStatus', () => {
    it('answers {} for no components and for components without times', () => {
        expect(aggregateStatus([])).toEqual({});
        expect(aggregateStatus([{}, {}])).toEqual({});
    });

    it('takes the latest success, error and run, and the earliest pass in flight', () => {
        expect(aggregateStatus([
            {
                lastSuccessAt: 100,
                lastRunAt: 100,
                runningSince: 500,
            },
            {
                lastSuccessAt: 300,
                lastErrorAt: 200,
                lastRunAt: 300,
                runningSince: 400,
            },
            { lastErrorAt: 50, runningSince: 600 },
        ])).toEqual({
            lastSuccessAt: 300,
            lastErrorAt: 200,
            lastRunAt: 300,
            runningSince: 400,
        });
    });

    it('keeps a time absent no component reports', () => {
        expect(aggregateStatus([{ lastErrorAt: 10, lastRunAt: 10 }])).toEqual({ lastErrorAt: 10, lastRunAt: 10 });
    });
});
