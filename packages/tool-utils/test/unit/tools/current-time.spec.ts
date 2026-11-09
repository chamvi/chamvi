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

const winter = () => new ControllableClock(new Date('2026-01-15T11:00:00Z'));

describe('current_time', () => {
    const tools = utilityTools({ timezone: 'Europe/Berlin', include: ['current_time'] });

    it('reads Europe/Berlin in winter', async () => {
        await expect(runTool(tools, 'current_time', {}, { clock: winter() })).resolves.toMatchObject({
            date: '2026-01-15',
            weekday: 'Thursday',
            time: '12:00',
            offset: '+01:00',
            timezone: 'Europe/Berlin',
        });
    });

    it('reads Europe/Berlin in summer', async () => {
        const clock = new ControllableClock(new Date('2026-07-15T11:00:00Z'));

        await expect(runTool(tools, 'current_time', {}, { clock })).resolves.toMatchObject({
            time: '13:00',
            offset: '+02:00',
        });
    });

    it('defaults to UTC', async () => {
        const result = await runTool(utilityTools({ env: {} }), 'current_time', {}, { clock: winter() });

        expect(result).toMatchObject({
            timezone: 'UTC',
            time: '11:00',
            offset: '+00:00',
        });
    });

    it('input timezone wins and applies to startTime', async () => {
        const result = await runTool(tools, 'current_time', { timezone: 'Asia/Tokyo' }, { clock: winter() });

        expect(result).toMatchObject({
            timezone: 'Asia/Tokyo',
            time: '20:00',
            offset: '+09:00',
        });
        expect((result as { startTime: string }).startTime).toMatch(/\+09:00/);
    });

    it('a non-string timezone fails naming timezone', async () => {
        await expect(runTool(tools, 'current_time', { timezone: 123 }, { clock: winter() })).rejects.toThrow(/timezone/);
    });

    it('timezone: Berlin fails naming timezone', async () => {
        await expect(runTool(tools, 'current_time', { timezone: 'Berlin' }, { clock: winter() })).rejects.toThrow(/timezone/);
    });

    it('advancing the clock 6 hours changes time and not startTime', async () => {
        const clock = winter();
        const first = await runTool(tools, 'current_time', {}, { clock, trigger: { receivedAt: new Date('2026-01-15T11:00:00Z') } }) as { time: string; startTime: string };

        clock.advance(6 * 3_600_000);

        const second = await runTool(tools, 'current_time', {}, { clock, trigger: { receivedAt: new Date('2026-01-15T11:00:00Z') } }) as { time: string; startTime: string };

        expect(first.time).toBe('12:00');
        expect(second.time).toBe('18:00');
        expect(second.startTime).toBe(first.startTime);
    });

    it('startTime is the intake time as ISO with offset', async () => {
        const result = await runTool(tools, 'current_time', {}, {
            clock: winter(),
            trigger: { receivedAt: new Date('2026-01-15T08:30:00Z') },
        }) as { startTime: string };

        expect(result.startTime).toBe('2026-01-15T09:30:00+01:00');
    });

    it('refuses a fixed offset as a zone', async () => {
        await expect(runTool(tools, 'current_time', { timezone: '+05:00' }, { clock: winter() })).rejects.toThrow(/timezone/);
    });
});
