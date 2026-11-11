/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { renderSVG } from 'uqr';

/**
 * The QR of `value` as an SVG `data:` URL, rendered in the browser (no
 * network; `img-src data:` is in the page's CSP).
 */
export function qrDataUrl(value: string): string {
    return `data:image/svg+xml,${encodeURIComponent(renderSVG(value, { border: 4 }))}`;
}
