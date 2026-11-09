/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

// Preloaded (--import) into the kill -9 child: runs the workspace sources as
// the Vitest aliases do, compiling TypeScript (the store-db entities' legacy
// decorators included) with swc.

import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { transformSync } from '@swc/core';

const packages = new URL('../../../', import.meta.url);

const aliases: Record<string, string> = {
    '@chamvi/core': 'core/src/index.ts',
    '@chamvi/core/conversation/persistence': 'core/src/conversation/persistence/index.ts',
    '@chamvi/store-db': 'store-db/src/index.ts',
    '@chamvi/chat-whatsapp': 'chat-whatsapp/src/index.ts',
};

registerHooks({
    resolve(specifier, context, nextResolve) {
        const target = aliases[specifier];

        if (target) {
            return { url: new URL(target, packages).href, shortCircuit: true };
        }

        return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
        if (!url.startsWith(packages.href) || !url.endsWith('.ts') || url.includes('/node_modules/')) {
            return nextLoad(url, context);
        }

        const filename = fileURLToPath(url);
        const { code } = transformSync(readFileSync(filename, 'utf8'), {
            filename,
            sourceMaps: 'inline',
            module: { type: 'es6' },
            jsc: {
                target: 'es2022',
                parser: { syntax: 'typescript', decorators: true },
                transform: { legacyDecorator: true, decoratorMetadata: false },
            },
        });

        return {
            format: 'module', 
            source: code, 
            shortCircuit: true, 
        };
    },
});
