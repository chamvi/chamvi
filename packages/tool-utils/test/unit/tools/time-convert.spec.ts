/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { utilityTools } from '@chamvi/tool-utils';
import { runTool } from '../../utils/run.ts';

describe('time_convert', () => {
    const tools = utilityTools({ timezone: 'Europe/Berlin', include: ['time_convert'] });
    const convert = (input: unknown) => runTool(tools, 'time_convert', input);

    it('converts across zones', async () => {
        const result = await convert({
            dateTime: '2026-07-01T15:00',
            from: 'America/New_York',
            to: 'Europe/Berlin',
        });

        expect(result).toMatchObject({
            from: {
                time: '15:00',
                timezone: 'America/New_York',
                offset: '-04:00',
            },
            to: {
                time: '21:00',
                timezone: 'Europe/Berlin',
                offset: '+02:00',
            },
        });
    });

    it('uses the default zone without from', async () => {
        await expect(convert({ dateTime: '2026-01-01T12:00', to: 'UTC' })).resolves.toMatchObject({ from: { timezone: 'Europe/Berlin' }, to: { time: '11:00' } });
    });

    it('resolves a DST gap time without error', async () => {
        await expect(convert({
            dateTime: '2026-03-29T02:30',
            from: 'Europe/Berlin',
            to: 'Europe/Berlin',
        })).resolves.toMatchObject({ to: { time: '03:30' } });
    });

    it('accepts an instant without from', async () => {
        await expect(convert({ dateTime: '2026-01-01T12:00:00Z', to: 'Asia/Tokyo' })).resolves.toMatchObject({ to: { time: '21:00' } });
    });

    it('refuses an offset together with from', async () => {
        await expect(convert({
            dateTime: '2026-01-01T12:00:00Z',
            from: 'Europe/Berlin',
            to: 'UTC',
        })).rejects.toThrow(/from/);
    });

    it('names an unknown to zone', async () => {
        await expect(convert({ dateTime: '2026-01-01T12:00', to: 'Mars/Base' })).rejects.toThrow(/to /);
    });
});
