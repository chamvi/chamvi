/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    DContext,
    DController,
    DGet,
    DTags,
} from '@routup/decorators';
import type { IAppEvent } from 'routup';
import { toInvoker, usePrincipal } from '../auth/helpers.ts';
import { ForceLoggedInMiddleware } from '../middleware/index.ts';
import type { MeView } from './types.ts';

@DTags('me')
@DController('/me')
export class MeController {
    /** `GET /me`: any authenticated principal, its own identity only (never its bindings or authorization). */
    @DGet('', [ForceLoggedInMiddleware])
    async me(@DContext() event: IAppEvent): Promise<MeView> {
        const {
            id,
            kind,
            name,
            identity,
        } = toInvoker(await usePrincipal(event));

        return {
            id,
            kind,
            ...(name !== undefined ? { name } : {}),
            ...(identity !== undefined ? { identity } : {}),
        };
    }
}
