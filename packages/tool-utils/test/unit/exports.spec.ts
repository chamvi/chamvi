/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import * as utils from '@chamvi/tool-utils';

describe('public api', () => {
    it('exports the factory, the names and the variable', () => {
        expect(utils.TIMEZONE_VARIABLE).toBe('CHAMVI_TIMEZONE');
        expect(utils.UTILITY_TOOL_NAMES).toEqual([
            'current_time',
            'time_convert',
            'date_add',
            'date_diff',
            'date_info',
            'next_weekday',
            'calculate',
            'run_info',
        ]);
        expect(utils.utilityTools).toBeTypeOf('function');
    });

    it('keeps the internals internal', () => {
        expect(Object.keys(utils).sort()).toEqual([
            'TIMEZONE_VARIABLE',
            'UTILITY_TOOL_NAMES',
            'utilityTools',
        ]);
    });
});
