/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export type UiPageModuleOptions = {
    /** The module's unique name, e.g. `chamvi:tool-mail-ui`. */
    name: string;
    /** The sidebar label. */
    label: string;
    /** The connection types the page configures. */
    types: readonly string[];
    /** The page's segment under `<uiBase>/ext`. */
    slug: string;
    /** The page's prebuilt folder. */
    root: string;
    /** The dashboard's path under the app's `basePath`. Default `/ui`. */
    uiBase?: string;
};
