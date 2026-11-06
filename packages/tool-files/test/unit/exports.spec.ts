/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    describe,
    expect,
    expectTypeOf,
    it,
} from 'vitest';
import type { ToolSet } from 'ai';
import type { Artifact } from '@chamvi/core';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import * as files from '@chamvi/tool-files';
import type {
    FileToolsOptions,
    ListArtifactsInput,
    ListArtifactsResult,
    ProcessFilesInput,
    ProcessFilesResult,
} from '@chamvi/tool-files';

describe('public API', () => {
    it('exports only the factory and default limits with native SDK/core types', () => {
        expect(Object.keys(files).sort()).toEqual(['FILES_MAX_BYTES', 'FILES_MAX_FILES', 'FILES_TIMEOUT_MS', 'fileTools']);
        expect(files.FILES_MAX_BYTES).toBe(5_242_880);
        expect(files.FILES_MAX_FILES).toBe(16);
        expect(files.FILES_TIMEOUT_MS).toBe(30_000);
        expect(Object.keys(files.fileTools())).toEqual(['list_artifacts', 'process_files']);
        expectTypeOf(files.fileTools).returns.toEqualTypeOf<ToolSet>();
        expectTypeOf<ProcessFilesResult['artifacts']>().toEqualTypeOf<Artifact[]>();
        expectTypeOf<ProcessFilesInput>().toEqualTypeOf<{
            command: string;
            inputs?: { artifactId: string; path: string }[];
            outputs?: { path: string; mediaType: string }[]
        }>();
        expectTypeOf<ListArtifactsInput>().toEqualTypeOf<{ offset?: number }>();
        expectTypeOf<ListArtifactsResult>().toEqualTypeOf<{ artifacts: Artifact[]; nextOffset?: number }>();
        expectTypeOf<FileToolsOptions>().toEqualTypeOf<{ maxBytes?: number; timeoutMs?: number }>();
    });

    it.each([null, [], 1, { maxBytes: null }, { timeoutMs: null }, { maxBytes: 0 }, { maxBytes: 16_777_217 }, { maxBytes: 1.2 }, { maxBytes: NaN }, { timeoutMs: 0 }, { timeoutMs: Infinity }, { timeoutMs: 2_147_483_648 }, { timeoutMs: '1' }])('rejects invalid factory options: %j', (options) => {
        expect(() => files.fileTools(options as FileToolsOptions)).toThrow(InvalidAgentDefinitionError);
    });

    it('accepts boundary option values', () => {
        expect(() => files.fileTools({ maxBytes: 1, timeoutMs: 1 })).not.toThrow();
        expect(() => files.fileTools({ maxBytes: 16_777_216, timeoutMs: 2_147_483_647 })).not.toThrow();
    });
});
