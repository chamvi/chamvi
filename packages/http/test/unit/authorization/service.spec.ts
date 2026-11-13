/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isValidupError } from 'validup';
import { describe, expect, it } from 'vitest';
import { PERMISSION_NAMES } from '@chamvi/access';
import { ControllableClock } from '@chamvi/test-kit';
import { AuthorizationService } from '../../../src/authorization/service.ts';
import { principalOf } from '../../utils/principal.ts';

describe('AuthorizationService', () => {
    it('answers every permission name without names', async () => {
        const service = new AuthorizationService({ clock: new ControllableClock() });

        expect(await service.check({}, principalOf(...PERMISSION_NAMES))).toEqual({ permissions: [...PERMISSION_NAMES] });
    });

    it('answers a name asked twice once, in request order', async () => {
        const service = new AuthorizationService({ clock: new ControllableClock() });

        // the http-level spec covers unknown names; here only the dedupe
        expect(await service.check({ names: ['b', 'a', 'b', 'a'] }, principalOf('a', 'b'))).toEqual({ permissions: ['b', 'a'] });
    });

    it('rejects a names value that is not a string array with a validup error', async () => {
        const service = new AuthorizationService({ clock: new ControllableClock() });
        const error = await service.check({ names: 'a' } as never, principalOf('a')).catch((e: unknown) => e);

        // the error handler answers a validup error with 400 validation_error
        expect(isValidupError(error)).toBe(true);
    });
});
