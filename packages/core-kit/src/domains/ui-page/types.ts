/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/**
 * A separately built page registered with the dashboard's shell. `path` is
 * relative to the app's `basePath`; `GET /ui-pages` answers it prefixed, so a
 * plain link works.
 */
export type UiPage = {
    slug: string;
    label: string;
    /** The connection types the page configures. */
    types: readonly string[];
    path: string;
};
