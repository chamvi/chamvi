/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** One file of a build. */
export type BuildFile = {
    bytes: Uint8Array;
    type: string;
    /** Under `assets/`: content-hashed, cached for a year. */
    immutable: boolean;
};

/** What `buildCsp()` reads of a page's config: the authup origin joins `connect-src` and `form-action`. */
export type StaticCspConfig = {
    [key: string]: unknown;
    auth?: {
        authup?: { url: string; [key: string]: unknown };
        [key: string]: unknown;
    };
};

export type StaticRoutesOptions = {
    /** The page's path under the app's `basePath` (lower case), e.g. `/ui/ext/tool-mail`. */
    path: string;
    /** The build folder; it must hold an `index.html` with the config marker. */
    root: string;
    /** The config rendered into `index.html`, per app `basePath`. */
    config: (apiBase: string) => unknown;
    /** The Content-Security-Policy of that config. */
    csp: (config: unknown) => string;
};

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
