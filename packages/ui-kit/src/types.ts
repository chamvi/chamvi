/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { AppContext } from './context/types.ts';

export type UiKitOptions = {
    /** Provides the app context to every component (`useAppContext`). */
    context?: AppContext;
    /** Registers the kit's components globally: all of them, or the named ones. */
    components?: boolean | string[];
};
