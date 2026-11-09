/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { UiPage } from '@chamvi/http';
import type { Router } from 'vue-router';
import type { ISession } from '../auth/types.ts';
import type { UiConfig } from '../config/types.ts';

/** The line glyphs of the approved mockup. */
export type IconName = 'agents' | 'runs' | 'approvals' | 'state' | 'schedules' | 'sun' | 'moon' | 'logout' |
    'go' | 'back' | 'play' | 'lock' | 'hand' | 'check' | 'cross' | 'search' | 'connections';

export type MountPageOptions = {
    /**
     * Builds the page's router, which guards its own routes. A page without
     * one restores the session before mounting and leaves for the dashboard's
     * login when no principal is found.
     */
    router?: (context: { config: UiConfig; session: ISession }) => Router;
};

/** One entry of `GET /ui-pages`; `path` carries the app's `basePath`, so a plain link works. */
export type UiPageWire = UiPage;
