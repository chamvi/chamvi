/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Artifact } from '@chamvi/core';

export type ProcessFilesInput = {
    command: string;
    inputs?: Array<{ artifactId: string; path: string }>;
    outputs?: Array<{ path: string; mediaType: string }>;
};

export type ProcessFilesResult = {
    exitCode: number;
    stdout: string;
    stderr: string;
    artifacts: Artifact[];
};

export type ListArtifactsInput = { offset?: number };
export type ListArtifactsResult = { artifacts: Artifact[]; nextOffset?: number };
