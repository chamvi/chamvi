/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** One route of a contributed controller; internal. */
export type ControllerRoute = {
    /** Uppercased, e.g. `GET`. */
    method: string;
    /** Base path plus method path as declared, without a trailing slash, e.g. `/notes/:id/approve`. */
    path: string;
    /** `path` lowercased with every parameter name replaced by `:`, e.g. `/notes/:/approve`: equal keys match the same requests. */
    key: string;
};
