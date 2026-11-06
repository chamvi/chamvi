/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ConnectionStatus, ConnectionWidget } from '@chamvi/core';

/** One entry of `GET /connections` (never widgets). */
export type ConnectionView = {
    name: string;
    type: string;
    status: ConnectionStatus;
};

/** `GET /connections/:name`: `widgets` only for a holder of `connection:<name>:write`. */
export type ConnectionDetailView = ConnectionView & {
    widgets?: ConnectionWidget[];
};
