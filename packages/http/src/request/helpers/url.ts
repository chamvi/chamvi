/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { BadRequestError } from '@chamvi/errors';
import type { IAppEvent } from 'routup';

/**
 * 400 for a NUL character (`%00`) in the path or the query: Postgres text
 * columns refuse it, so a lookup by such an id, key or filter would fail
 * as a 500 instead of a 404.
 */
export function assertNoNul(event: IAppEvent): void {
    let found = /%00/i.test(event.path);

    for (const [key, value] of event.searchParams) {
        if (key.includes('\0') || value.includes('\0')) {
            found = true;
        }
    }

    if (found) {
        throw new BadRequestError({ message: 'The request URL must not contain a NUL character.' });
    }
}
