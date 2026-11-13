/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { PERMISSION_NAMES } from '@chamvi/access';
import { defineCoreHandler } from 'routup';
import type { App } from 'routup';
import { Container } from 'validup';
import type { HttpContext } from '../app/types.ts';
import { authenticate, isGrantedSome } from '../auth/helpers.ts';
import { readJsonBody, validateBody } from '../request/helpers.ts';
import { isStringArray } from '../request/validators.ts';
import { AUTHORIZATION_CHECK_MAX_NAMES, AUTHORIZATION_CHECK_NAME_MAX_LENGTH } from './constants.ts';
import type { AuthorizationCheckBody, AuthorizationCheckView } from './types.ts';

/**
 * `POST /authorization/check`: any authenticated principal asks which of
 * the permission names it may attempt; the verdict per name is
 * `isGrantedSome` (an upper bound), and no binding or policy is answered.
 */
export function registerAuthorizationRoutes(app: App, ctx: HttpContext): void {
    const container = new Container<AuthorizationCheckBody>();

    container.mount('names', { optional: true }, isStringArray({
        max: AUTHORIZATION_CHECK_MAX_NAMES,
        item: { min: 1, max: AUTHORIZATION_CHECK_NAME_MAX_LENGTH },
    }));

    app.post('/authorization/check', defineCoreHandler(async (event): Promise<AuthorizationCheckView> => {
        // authenticate first, so an anonymous client cannot make the server buffer a body
        const principal = await authenticate(event, ctx);
        // an empty or absent body reads as `{}`
        const body = await validateBody(container, await readJsonBody(event, ctx.bodyLimit));
        const names = [...new Set(body.names ?? PERMISSION_NAMES)];
        const verdicts = await Promise.all(names.map((name) => isGrantedSome(principal, name, ctx.clock)));

        return { permissions: names.filter((_, index) => verdicts[index]) };
    }));
}
