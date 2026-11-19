/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ArtifactNotFoundError } from '@chamvi/core';
import type { Artifact, Run } from '@chamvi/store';
import type { HttpContext } from '../../app/types.ts';

/** An artifact of `run` with its bytes; ArtifactNotFoundError (404) for an unknown id or another run's artifact. */
export async function loadRunArtifact(ctx: Pick<HttpContext, 'artifactService'>, run: Run, id: string): Promise<{ artifact: Artifact; data: Uint8Array }> {
    const artifact = await ctx.artifactService.findOne(id);

    if (!artifact || artifact.runId !== run.id) {
        throw new ArtifactNotFoundError(id);
    }

    const data = await ctx.artifactService.read(id);

    if (!data) {
        throw new ArtifactNotFoundError(id);
    }

    return { artifact, data };
}

/** The bytes as a response body; a view over a SharedArrayBuffer is copied (a body needs an ArrayBuffer). */
export function toBody(data: Uint8Array): Uint8Array<ArrayBuffer> {
    return data.buffer instanceof ArrayBuffer ? data as Uint8Array<ArrayBuffer> : new Uint8Array(data);
}

/** A quoted-string fallback: printable ASCII only, without `"` and `\`. */
function asciiFilename(filename: string): string {
    return filename.replace(/[^\x20-\x7e]|["\\]/g, '_');
}

/** RFC 5987 `ext-value` characters: what encodeURIComponent leaves, minus `'()*`. */
function encodeRfc5987(value: string): string {
    return encodeURIComponent(value).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** `attachment`, with `filename` and an RFC 5987 `filename*` when the artifact has a filename. */
export function contentDisposition(filename: string | undefined): string {
    if (filename === undefined) {
        return 'attachment';
    }

    return `attachment; filename="${asciiFilename(filename)}"; filename*=UTF-8''${encodeRfc5987(filename)}`;
}
