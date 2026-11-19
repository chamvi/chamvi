/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { PeerResolverOptions } from '../resolver/types.ts';

/**
 * `createPeerResolver()` options; `clock` defaults to the app's,
 * `approvalUrl` to the UI link from `CHAMVI_PUBLIC_URL` (none without it).
 */
export type PeerModuleOptions = Omit<PeerResolverOptions, 'clock' | 'approvalUrl'> &
    Partial<Pick<PeerResolverOptions, 'clock' | 'approvalUrl'>>;
