/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { BadRequestError } from '@ebec/http';
import type { IAppEvent } from 'routup';
import { useHttpContext } from '../app/helpers.ts';
import { REQUEST_BODY_CACHE } from '../request/constants.ts';
import { readJsonBody } from '../request/helpers.ts';

/**
 * Reads the JSON body with chamvi's reader (`bodyLimit`, 413, 415, 400) into
 * `@routup/body`'s cache, so `@DBody()` returns it and never reads the
 * stream. An empty body is `{}`, or a 400 when `required`; a JSON `null`
 * stays `null`, so `validateBody` refuses it as no object.
 */
export async function cacheJsonBody(event: IAppEvent, required: boolean): Promise<void> {
    const body = await readJsonBody(event, useHttpContext(event).bodyLimit);

    if (body === undefined && required) {
        throw new BadRequestError({ message: 'The request needs a JSON body.' });
    }

    event.store[REQUEST_BODY_CACHE] = body === undefined ? {} : body;
}
