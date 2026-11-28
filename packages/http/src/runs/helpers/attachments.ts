/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ArtifactInput, AttachmentRequestBody } from '@chamvi/core-kit';

/**
 * Decodes the attachments core-kit's RunValidator checked (strict RFC 4648
 * base64 with zero pad bits, so the decode is exact) to plain `Uint8Array`s.
 */
export function decodeAttachments(attachments: AttachmentRequestBody[]): ArtifactInput[] {
    return attachments.map((entry) => ({ ...entry, data: new Uint8Array(Buffer.from(entry.data, 'base64')) }));
}
