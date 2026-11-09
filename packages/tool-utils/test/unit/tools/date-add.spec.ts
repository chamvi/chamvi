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

describe('date_add', () => {
    const tools = utilityTools({ timezone: 'Europe/Berlin', include: ['date_add'] });
    const add = (input: unknown, clock?: ControllableClock) => runTool(tools, 'date_add', input, clock ? { clock } : {});

    it('clamps a month end', async () => {
        await expect(add({ date: '2026-01-31', months: 1 })).resolves.toMatchObject({ date: '2026-02-28', time: '00:00' });
    });

    it('keeps the wall clock across a DST change for days', async () => {
        await expect(add({ date: '2026-03-28T12:00', days: 1 })).resolves.toMatchObject({
            date: '2026-03-29', 
            time: '12:00', 
            offset: '+02:00',
        });
    });

    it('adds exact hours across a DST gap', async () => {
        await expect(add({ date: '2026-03-29T00:00', hours: 3 })).resolves.toMatchObject({ time: '04:00' });
    });

    it('counts hours from midnight for a date-only input', async () => {
        await expect(add({ date: '2026-05-01', hours: 2 })).resolves.toMatchObject({ date: '2026-05-01', time: '02:00' });
    });

    it('accepts negative amounts', async () => {
        await expect(add({
            date: '2026-03-01', 
            days: -1, 
            weeks: -1, 
        })).resolves.toMatchObject({ date: '2026-02-21' });
    });

    it('keeps the wall clock of now without a date', async () => {
        const clock = new ControllableClock(new Date('2026-01-15T11:30:00Z'));

        await expect(add({ days: 1 }, clock)).resolves.toMatchObject({ date: '2026-01-16', time: '12:30' });
    });

    it('reads the date in the given timezone', async () => {
        await expect(add({
            date: '2026-01-01T10:00', 
            hours: 1, 
            timezone: 'America/New_York', 
        })).resolves.toMatchObject({
            time: '11:00', 
            timezone: 'America/New_York', 
            offset: '-05:00',
        });
    });

    it('refuses an impossible date naming date', async () => {
        await expect(add({ date: '2026-02-30', days: 1 })).rejects.toThrow(/date/);
    });

    it('refuses an amount out of range naming the amount', async () => {
        await expect(add({ date: '2026-01-01', years: 999999 })).rejects.toThrow(/amount/);
    });

    it('refuses a non-integer amount', async () => {
        await expect(add({ date: '2026-01-01', days: 1.5 })).rejects.toThrow(/days/);
    });

    it('accepts mixed-sign amounts', async () => {
        await expect(add({
            date: '2026-01-31', 
            months: 1, 
            days: -1, 
        })).resolves.toMatchObject({ date: '2026-02-27' });
        await expect(add({
            date: '2026-06-15T12:00', 
            hours: 1, 
            minutes: -30, 
        })).resolves.toMatchObject({ time: '12:30' });
        await expect(add({
            date: '2026-06-15', 
            years: 1, 
            months: -1, 
        })).resolves.toMatchObject({ date: '2027-05-15' });
    });
});
