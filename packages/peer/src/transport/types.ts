/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '@chamvi/core';
import type { IPeerCredential } from '../auth/types.ts';

export type PeerTransportOptions = {
    /** The peer's name, for error messages. */
    name: string;
    /** The peer's API base (origin plus basePath, no trailing slash). */
    url: string;
    credential: IPeerCredential;
    clock: IClock;
    fetch: typeof fetch;
};
