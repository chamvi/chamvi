/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

// Runs on the built package (spawned by test/unit/database-lazy.spec.ts):
// imports @chamvi/test-kit and builds an engine on memory repositories.
// Prints the kit's exports and every module URL the process resolved, as JSON.
import { registerHooks } from 'node:module';

const resolved = new Set();

registerHooks({
    resolve(specifier, context, nextResolve) {
        const result = nextResolve(specifier, context);

        resolved.add(result.url);

        return result;
    },
});

const kit = await import('@chamvi/test-kit');

kit.createTestEngine({ agents: [] });

process.stdout.write(`${JSON.stringify({ exports: Object.keys(kit).sort(), resolved: [...resolved] })}\n`);
