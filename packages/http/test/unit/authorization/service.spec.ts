/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isValidupError } from 'validup';
import { 
    describe, 
    expect, 
    it, 
    vi, 
} from 'vitest';
import { PERMISSION_NAMES } from '@chamvi/access';
import { ControllableClock } from '@chamvi/test-kit';
import type { Principal } from '@chamvi/http';
import { AuthorizationService } from '../../../src/authorization/service.ts';

function principalOf(...names: string[]): Principal {
    return {
        id: 'p',
        kind: 'token',
        bindings: names.map((name) => ({ permission: { name } })),
    };
}

describe('AuthorizationService', () => {
    it('answers every permission name without names', async () => {
        const service = new AuthorizationService({ clock: new ControllableClock() });

        expect(await service.check({}, principalOf(...PERMISSION_NAMES))).toEqual({ permissions: [...PERMISSION_NAMES] });
    });

    it('evaluates a name asked twice once', async () => {
        const clock = new ControllableClock();
        const now = vi.spyOn(clock, 'now');
        const service = new AuthorizationService({ clock });

        expect(await service.check({ names: ['a', 'a'] }, principalOf('a'))).toEqual({ permissions: ['a'] });
        expect(now).toHaveBeenCalledTimes(1);
    });

    it('rejects names that are no array with a validation error', async () => {
        const service = new AuthorizationService({ clock: new ControllableClock() });
        const error = await service.check({ names: 'a' } as never, principalOf('a')).catch((e: unknown) => e);

        // the error handler answers a validup error with 400 validation_error
        expect(isValidupError(error)).toBe(true);
    });
});
