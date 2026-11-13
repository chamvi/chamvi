/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { SuccessStatus } from './types.ts';

/**
 * Documents a route's success status when it is not 200: the `DStatus`
 * handler in `trapi.config.ts` documents the return type under it, with no
 * 200. A build-time marker only: the handler still sets the status at
 * runtime (`event.response.status`). The argument must be a string literal.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- read by trapi from the source, never at runtime
export function DStatus(_status: SuccessStatus): MethodDecorator {
    return () => {};
}
