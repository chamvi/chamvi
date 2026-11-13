/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { PERMISSION_NAMES } from '@chamvi/access';
import type { IClock } from '@chamvi/core';
import { Container } from 'validup';
import { isGrantedSome } from '../auth/helpers.ts';
import type { Principal } from '../auth/types.ts';
import { validateBody } from '../request/helpers.ts';
import { isStringArray } from '../request/validators.ts';
import { AUTHORIZATION_CHECK_MAX_NAMES, AUTHORIZATION_CHECK_NAME_MAX_LENGTH } from './constants.ts';
import type {
    AuthorizationCheckBody,
    AuthorizationCheckView,
    AuthorizationServiceContext,
    IAuthorizationService,
} from './types.ts';

/**
 * Which permission names a principal may attempt: the verdict per name is
 * `isGrantedSome` (an upper bound), and no binding or policy is answered.
 */
export class AuthorizationService implements IAuthorizationService {
    protected clock: IClock;

    protected container: Container<AuthorizationCheckBody>;

    constructor(ctx: AuthorizationServiceContext) {
        this.clock = ctx.clock;
        this.container = new Container<AuthorizationCheckBody>();
        this.container.mount('names', { optional: true }, isStringArray({
            max: AUTHORIZATION_CHECK_MAX_NAMES,
            item: { min: 1, max: AUTHORIZATION_CHECK_NAME_MAX_LENGTH },
        }));
    }

    async check(data: AuthorizationCheckBody | undefined, principal: Principal): Promise<AuthorizationCheckView> {
        const body = await validateBody(this.container, data);
        const names = [...new Set(body.names ?? PERMISSION_NAMES)];
        const verdicts = await Promise.all(names.map((name) => isGrantedSome(principal, name, this.clock)));

        return { permissions: names.filter((_, index) => verdicts[index]) };
    }
}
