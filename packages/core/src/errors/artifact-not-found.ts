/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError, ErrorCode } from '@chamvi/errors';

export class ArtifactNotFoundError extends ChamviError {
    constructor(artifactId: string) {
        super({ message: `Artifact "${artifactId}" was not found.`, code: ErrorCode.ARTIFACT_NOT_FOUND });
    }
}
