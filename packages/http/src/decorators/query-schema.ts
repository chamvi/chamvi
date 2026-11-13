/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { QuerySchemaName } from './types.ts';

/**
 * Names the query vocabulary a list route decodes. A build-time marker
 * only: the `DQuerySchema` handler in `trapi.config.ts` adds the matching
 * query parameters to the operation; at runtime it does nothing. The
 * argument must be a string literal, the only form trapi can read.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- read by trapi from the source, never at runtime
export function DQuerySchema(_name: QuerySchemaName): MethodDecorator {
    return () => {};
}
