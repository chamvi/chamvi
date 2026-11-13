/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { HandlerInterface } from '@routup/decorators';
import type { IAppEvent } from 'routup';
import { cacheJsonBody } from './helpers.ts';

/** A required JSON body for `@DBody()`: an empty one is a 400. List it after ForceLoggedInMiddleware. */
export class RequiredJsonBodyMiddleware implements HandlerInterface {
    public async run(event: IAppEvent) {
        await cacheJsonBody(event, true);

        return event.next();
    }
}
