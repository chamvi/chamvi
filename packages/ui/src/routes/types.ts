/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { UiAuthupConfig } from '../config/types.ts';

export type UiRoutesOptions = {
    /** The dashboard's path under the app's `basePath` (lower case). Default `/ui`. */
    basePath?: string;
    auth?: {
        /** Offer the token-paste sign-in. Default `true`. */
        tokens?: boolean;
        authup?: UiAuthupConfig;
    };
    /** The build folder. Default the package's `dist/app`. */
    root?: string;
};
