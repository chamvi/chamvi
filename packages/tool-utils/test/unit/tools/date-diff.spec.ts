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

describe('date_diff', () => {
    const tools = utilityTools({ timezone: 'Europe/Berlin', include: ['date_diff'] });
    const diff = (input: unknown, clock?: ControllableClock) => runTool(tools, 'date_diff', input, clock ? { clock } : {});

    it('measures each unit separately', async () => {
        await expect(diff({ from: '2026-01-31', to: '2026-03-01' })).resolves.toEqual({
            days: 29,
            weeks: 4,
            months: 1,
            years: 0,
        });
    });

    it('is signed when reversed', async () => {
        await expect(diff({ from: '2026-03-01', to: '2026-01-31' })).resolves.toEqual({
            days: -29,
            weeks: -4,
            months: -1,
            years: 0,
        });
    });

    it('defaults to today', async () => {
        const clock = new ControllableClock(new Date('2026-01-15T11:00:00Z'));

        await expect(diff({ from: '2026-01-10' }, clock)).resolves.toMatchObject({ days: 5 });
    });

    it('reduces an instant to its date in the zone', async () => {
        await expect(diff({ from: '2026-01-01', to: '2026-01-01T23:30:00Z' })).resolves.toMatchObject({ days: 1 });
    });

    it('names the bad field', async () => {
        await expect(diff({ from: '2026-01-01', to: 'nope' })).rejects.toThrow(/to/);
    });
});
