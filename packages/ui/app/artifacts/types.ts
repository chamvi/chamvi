/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IApiClient } from '../api/types.ts';

/**
 * One artifact as the dashboard shows it: `loading` (metadata or bytes on
 * the way), `image` (an inline raster image at `url`), `file` (any other
 * type, offered as a download) or `missing` (not among the run's artifacts,
 * or its bytes could not be read).
 */
export type ArtifactTile = {
    id: string;
    /** The filename, else the id. */
    name: string;
    mediaType?: string;
    status: 'loading' | 'image' | 'file' | 'missing';
    /** The object URL of an `image`. */
    url?: string;
};

/** `URL.createObjectURL`/`revokeObjectURL`, injectable for tests. */
export type ObjectUrls = {
    create(blob: Blob): string;
    revoke(url: string): void;
};

/** Options of `useArtifactTiles()`. */
export type ArtifactTilesOptions = {
    client: IApiClient;
    runId: () => string | undefined;
    /** A new key (the approval id) drops every tile, revokes its URLs and loads again. */
    key: () => string | undefined;
    /** The ids to show, read when a key loads. */
    ids: () => string[];
    urls?: ObjectUrls;
    save?: (blob: Blob, filename: string) => void | Promise<void>;
};
