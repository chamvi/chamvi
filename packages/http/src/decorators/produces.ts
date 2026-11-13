/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ProducedMediaType } from './types.ts';

/**
 * Declares a route's 200 body that is no JSON: `text/event-stream` (a
 * string) or `application/octet-stream` (binary). A build-time marker
 * only: the `DProduces` handler in `trapi.config.ts` adds the response;
 * at runtime it does nothing. Both arguments must be string literals.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- read by trapi from the source, never at runtime
export function DProduces(_mediaType: ProducedMediaType, _description: string): MethodDecorator {
    return () => {};
}
