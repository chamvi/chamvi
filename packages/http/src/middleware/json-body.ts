/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { HandlerInterface } from '@routup/decorators';
import type { IAppEvent } from 'routup';
import { cacheJsonBody } from './helpers.ts';

/** An optional JSON body for `@DBody()`: an empty one reads as `{}`. List it after ForceLoggedInMiddleware. */
export class JsonBodyMiddleware implements HandlerInterface {
    public async run(event: IAppEvent): Promise<Response | undefined> {
        await cacheJsonBody(event, false);

        return event.next();
    }
}
