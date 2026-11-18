/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** `/a/b` from the segments, each `encodeURIComponent`-ed. */
export function path(...segments: string[]): string {
    return segments.map((segment) => `/${encodeURIComponent(segment)}`).join('');
}
