/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** The default entry of the source commands (dev, build, start --dev). */
export const SOURCE_ENTRY = 'src/index.ts';

/** The default entry of the built commands (start, run-job, migrate). */
export const BUILT_ENTRY = 'dist/index.mjs';

/** Written to stderr when a command runs the default app, there being no entry file. */
export const DEFAULT_APP_NOTICE = 'no entry file: running the default app (agents from ./agents or CHAMVI_AGENTS_DIR, agent packages from chamvi.json or CHAMVI_AGENTS)\n';
