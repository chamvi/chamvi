/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClient } from '@chamvi/http-kit';
import type { ISession } from '../auth/types.ts';
import type { UiConfig } from '../config/types.ts';

/** What every view needs: the config, the API client and the session. */
export type AppContext = {
    config: UiConfig;
    client: IClient;
    session: ISession;
    /** The tab's `sessionStorage`: tokens and the deep-link token live here only. */
    storage: Storage;
};
