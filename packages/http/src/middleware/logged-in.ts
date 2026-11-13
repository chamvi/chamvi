/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { HandlerInterface } from '@routup/decorators';
import type { IAppEvent } from 'routup';
import { usePrincipal } from '../auth/helpers.ts';

/** Authenticates the request (401 otherwise) before any body is read. */
export class ForceLoggedInMiddleware implements HandlerInterface {
    public async run(event: IAppEvent): Promise<Response | undefined> {
        await usePrincipal(event);

        return event.next();
    }
}
