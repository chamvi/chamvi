/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { ApiError } from '@chamvi/ui-kit';
import { refusalText } from '../../../../app/errors/helpers.ts';

describe('refusalText', () => {
    it('names the permission of a 403 and the target', () => {
        const error = new ApiError(403, 'FORBIDDEN', 'Forbidden');

        expect(refusalText(error, 'Starting a run', 'chamvi_agent_run', 'deploy')).toBe('Starting a run needs chamvi_agent_run for deploy.');
    });

    it('prefers the permission the server\'s message names', () => {
        const error = new ApiError(403, 'FORBIDDEN', 'Missing permission "chamvi_agent_read".');

        expect(refusalText(error, 'Starting a run', 'chamvi_agent_run', 'deploy')).toBe('Starting a run needs chamvi_agent_read for deploy.');
    });

    it('keeps code and message of any other error', () => {
        expect(refusalText(new ApiError(409, 'conflict', 'busy'), 'Starting a run', 'chamvi_agent_run', 'deploy')).toBe('conflict · busy');
        expect(refusalText(new Error('offline'), 'Starting a run', 'chamvi_agent_run', 'deploy')).toContain('offline');
    });
});
