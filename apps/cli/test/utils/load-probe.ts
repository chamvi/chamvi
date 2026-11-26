/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/*
 * Preloaded into a spawned bin (`NODE_OPTIONS=--import <this file>`, see
 * loadProbeEnv()): records every module URL the process resolves and, as
 * it exits, writes LOAD_PROBE_LINE followed by those of TypeORM,
 * typeorm-extension and `@chamvi/store-db` (as JSON) to stderr, so a bin
 * spec sees what a command loaded.
 */

import { registerHooks } from 'node:module';
import { LOAD_PROBE_LINE, LOAD_PROBE_PATTERN } from './spawn.ts';

const resolved = new Set<string>();

registerHooks({
    resolve(specifier, context, nextResolve) {
        const result = nextResolve(specifier, context);

        resolved.add(result.url);

        return result;
    },
});

process.on('exit', () => {
    const loaded = [...resolved].filter((url) => LOAD_PROBE_PATTERN.test(url));

    process.stderr.write(`${LOAD_PROBE_LINE}${JSON.stringify(loaded)}\n`);
});
