/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { UTILITY_TOOL_NAMES, utilityTools } from '@chamvi/tool-utils';

describe('utilityTools', () => {
    it('builds every named tool by default', () => {
        expect(Object.keys(utilityTools({ env: {} })).sort()).toEqual([...UTILITY_TOOL_NAMES].sort());
        expect(UTILITY_TOOL_NAMES).toHaveLength(8);
    });
});
