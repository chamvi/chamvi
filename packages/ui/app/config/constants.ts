/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** The package's major.minor (`chamvi 0.1` on the login page), from vite.config.ts `define`. */
export const UI_VERSION = __CHAMVI_VERSION__.split('.').slice(0, 2).join('.');
