/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { UiConfig } from './types.ts';

/** The id of the `<script type="application/json">` holding the `UiConfig`. */
export const CONFIG_ELEMENT_ID = 'chamvi-config';

/** The config of the Vite dev server, which serves no injected block. */
export const DEV_CONFIG: UiConfig = {
    apiBase: '',
    uiBase: '/ui',
    auth: { tokens: true },
};
