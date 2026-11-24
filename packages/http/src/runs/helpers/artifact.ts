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
