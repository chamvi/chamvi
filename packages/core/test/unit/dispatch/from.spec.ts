/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { InvalidAgentDefinitionError, agent } from '@chamvi/core';

describe('agent.on() from', () => {
    it('accepts a remote caller as <peer>/<agent>', () => {
        expect(agent.on({ from: ['dev/maintainer', 'auditor'] }).options.from).toEqual(['dev/maintainer', 'auditor']);
    });

    it.each([
        'dev/',
        '/x',
        'a/b/c',
        'Dev/maintainer',
        'dev/Maintainer',
        `${'x'.repeat(65)}/maintainer`,
        `dev/${'x'.repeat(65)}`,
    ])('refuses the entry %j', (entry) => {
        expect(() => agent.on({ from: [entry] })).toThrow(InvalidAgentDefinitionError);
        expect(() => agent.on({ from: [entry] })).toThrow(/from entry/);
    });
});
