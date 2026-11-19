/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { DEV_HASH_LENGTH } from '../constants.ts';

/** The dev marker: `<name>@<version>+<the first DEV_HASH_LENGTH hex of the content hash>`. */
export function devMarker(versionMarker: string, hash: string): string {
    return `${versionMarker}+${hash.slice(0, DEV_HASH_LENGTH)}`;
}

/** Whether `marker` is a dev marker of `versionMarker` (`<name>@<version>+<12 hex>`). */
export function isDevMarkerOf(marker: string, versionMarker: string): boolean {
    const prefix = `${versionMarker}+`;

    return marker.startsWith(prefix) && new RegExp(`^[0-9a-f]{${DEV_HASH_LENGTH}}$`).test(marker.slice(prefix.length));
}

/** Whether a stored revision marker is a package agent's (`<name>@<version>`, dev `+<hash>`), not a folder's content hash. */
export function isPackageMarker(marker: string): boolean {
    return marker.includes('@');
}
