/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { normalizeOptions } from '../../../src/options/module.ts';
import { utilityTools } from '@chamvi/tool-utils';

describe('options', () => {
    it('option beats CHAMVI_TIMEZONE beats UTC', () => {
        const env = { CHAMVI_TIMEZONE: 'Europe/Paris' };

        expect(normalizeOptions({ timezone: 'Europe/Berlin', env }).timezone).toBe('Europe/Berlin');
        expect(normalizeOptions({ env }).timezone).toBe('Europe/Paris');
        expect(normalizeOptions({ env: {} }).timezone).toBe('UTC');
    });

    it('invalid option names timezone', () => {
        expect(() => normalizeOptions({ timezone: 'Berlin', env: {} })).toThrow(/timezone/);
        expect(() => normalizeOptions({ timezone: 'Berlin', env: {} })).toThrow(InvalidAgentDefinitionError);
    });

    it('invalid env names CHAMVI_TIMEZONE', () => {
        expect(() => normalizeOptions({ env: { CHAMVI_TIMEZONE: 'Nowhere/Land' } })).toThrow(/CHAMVI_TIMEZONE/);
    });

    it('unknown include name is named', () => {
        expect(() => normalizeOptions({ include: ['current_time', 'nope' as never], env: {} })).toThrow(/nope/);
    });

    it('include [] is refused', () => {
        expect(() => normalizeOptions({ include: [], env: {} })).toThrow(InvalidAgentDefinitionError);
    });

    it('include narrows the set', () => {
        expect(Object.keys(utilityTools({ include: ['current_time'] }))).toEqual(['current_time']);
        expect(Object.keys(utilityTools({ include: ['calculate'] }))).not.toContain('current_time');
    });
});
