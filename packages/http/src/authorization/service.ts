/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { PERMISSION_NAMES } from '@chamvi/access';
import { validateBody } from '@chamvi/core';
import type { IClock } from '@chamvi/core';
import { AuthorizationValidator } from '@chamvi/core-kit';
import { isGrantedSome } from '../auth/helpers/index.ts';
import type { Principal } from '../auth/types.ts';
import type { AuthorizationServiceContext, IAuthorizationService } from './types.ts';
import type { AuthorizationCheckBody, AuthorizationCheckView } from '@chamvi/core-kit';

/**
 * Which permission names a principal may attempt: the verdict per name is
 * `isGrantedSome` (an upper bound), and no binding or policy is answered.
 */
export class AuthorizationService implements IAuthorizationService {
    protected clock: IClock;

    protected validator: AuthorizationValidator;

    constructor(ctx: AuthorizationServiceContext) {
        this.clock = ctx.clock;
        this.validator = new AuthorizationValidator();
    }

    async check(data: AuthorizationCheckBody | undefined, principal: Principal): Promise<AuthorizationCheckView> {
        const body = await validateBody(this.validator, data);
        const names = [...new Set(body.names ?? PERMISSION_NAMES)];
        const verdicts = await Promise.all(names.map((name) => isGrantedSome(principal, name, this.clock)));

        return { permissions: names.filter((_, index) => verdicts[index]) };
    }
}
