/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { ControllableClock } from '@chamvi/test-kit';
import { utilityTools } from '@chamvi/tool-utils';
import { runTool } from '../../utils/run.ts';

describe('next_weekday', () => {
    const tools = utilityTools({ timezone: 'Europe/Berlin', include: ['next_weekday'] });
    const next = (input: unknown, clock?: ControllableClock) => runTool(tools, 'next_weekday', input, clock ? { clock } : {});
    // Monday
    const date = '2026-11-09';

    it('skips today by default', async () => {
        await expect(next({ weekday: 'monday', date })).resolves.toEqual({
            date: '2026-11-16',
            weekday: 'Monday',
            daysAway: 7,
        });
    });

    it('includes today on request', async () => {
        await expect(next({
            weekday: 'monday',
            date,
            includeToday: true,
        })).resolves.toEqual({
            date: '2026-11-09',
            weekday: 'Monday',
            daysAway: 0,
        });
    });

    it('finds a later weekday', async () => {
        await expect(next({ weekday: 'friday', date })).resolves.toMatchObject({ date: '2026-11-13', daysAway: 4 });
    });

    it('defaults to today and ignores case', async () => {
        const clock = new ControllableClock(new Date('2026-11-09T11:00:00Z'));

        await expect(next({ weekday: 'Sunday' }, clock)).resolves.toMatchObject({ daysAway: 6 });
    });

    it('refuses an unknown weekday naming weekday', async () => {
        await expect(next({ weekday: 'funday', date })).rejects.toThrow(/weekday/);
    });
});
