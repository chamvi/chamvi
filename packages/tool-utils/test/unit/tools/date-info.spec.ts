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

describe('date_info', () => {
    const tools = utilityTools({ timezone: 'Europe/Berlin', include: ['date_info'] });
    const info = (input: unknown, clock?: ControllableClock) => runTool(tools, 'date_info', input, clock ? { clock } : {});

    it('reads the ISO week at the year end', async () => {
        await expect(info({ date: '2026-12-31' })).resolves.toMatchObject({
            weekday: 'Thursday',
            isoWeek: 53,
            isoWeekYear: 2026,
            dayOfYear: 365,
        });
    });

    it('puts 2027-01-01 in the last week of 2026', async () => {
        await expect(info({ date: '2027-01-01' })).resolves.toMatchObject({ isoWeek: 53, isoWeekYear: 2026 });
    });

    it('reports a leap year', async () => {
        await expect(info({ date: '2024-02-10' })).resolves.toMatchObject({
            leapYear: true,
            daysInMonth: 29,
            date: '2024-02-10',
        });
    });

    it('defaults to today', async () => {
        const clock = new ControllableClock(new Date('2026-01-15T11:00:00Z'));

        await expect(info({}, clock)).resolves.toMatchObject({ date: '2026-01-15', weekday: 'Thursday' });
    });

    it('reads a space-separated offset as an instant', async () => {
        await expect(info({ date: '2026-01-01 23:30-05:00' })).resolves.toMatchObject({ date: '2026-01-02' });
    });

    it('refuses a calendar or zone annotation', async () => {
        await expect(info({ date: '2026-01-15T12:00[u-ca=hebrew]' })).rejects.toThrow(/date/);
        await expect(info({ date: '2026-01-15T12:00[Asia/Tokyo]' })).rejects.toThrow(/date/);
    });
});
