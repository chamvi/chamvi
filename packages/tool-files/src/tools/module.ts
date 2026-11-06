/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { normalizeOptions } from '../options/module.ts';
import type { FileToolsOptions } from '../options/types.ts';
import { listArtifactsTool } from './list.ts';
import { processFilesTool } from './process.ts';

/** Fresh in-memory file processing over explicitly selected run artifacts. */
export function fileTools(options: FileToolsOptions = {}) {
    const normalized = normalizeOptions(options);

    return { list_artifacts: listArtifactsTool(), process_files: processFilesTool(normalized) };
}
