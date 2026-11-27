/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ArtifactInput } from '@chamvi/core-kit';
import type { AttachmentWire } from '@chamvi/http-kit';

/** An attachment in the start route's format: the bytes in base64. */
export function toAttachmentWire(input: ArtifactInput): AttachmentWire {
    return {
        mediaType: input.mediaType,
        ...(input.filename !== undefined ? { filename: input.filename } : {}),
        data: Buffer.from(input.data).toString('base64'),
    };
}

/** Whether `response` is a redirect fetch did not follow (`redirect: 'manual'`). */
export function isRedirect(response: Response): boolean {
    return response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400);
}
