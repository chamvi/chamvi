/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/*
 * Preloaded into a spawned bin (`NODE_OPTIONS=--import <this file>`, see
 * hooksProbeEnv()): writes HOOKS_PROBE_LINE to stderr on every
 * `registerHooks` call, so a bin spec sees whether the CLI registered the
 * TypeScript hooks.
 */

import nodeModule from 'node:module';
import type { RegisterHooksOptions } from 'node:module';
import { HOOKS_PROBE_LINE } from './spawn.ts';

const target = nodeModule as unknown as { registerHooks: typeof nodeModule.registerHooks };
const { registerHooks } = target;

target.registerHooks = (options: RegisterHooksOptions) => {
    process.stderr.write(`${HOOKS_PROBE_LINE}\n`);

    return registerHooks(options);
};
// the named export `registerHooks` the CLI imports follows the patched default
nodeModule.syncBuiltinESMExports();
