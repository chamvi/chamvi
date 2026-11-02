/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import { createTempDir, writeTree } from '../../utils/folder.ts';
import { linkPackage } from '../../utils/packages.ts';

const SCRIPT = fileURLToPath(new URL('../../fixtures/identity/packages.mjs', import.meta.url));

/** Packages that throw when loaded: a package agent must never reach them. */
function decoys(prefix: string): Record<string, string> {
    const decoy = (name: string) => ({
        [`${prefix}node_modules/${name}/package.json`]: JSON.stringify({
            name,
            version: '0.0.0-decoy',
            type: 'module',
            exports: { '.': './index.mjs', './test': './index.mjs' },
        }),
        [`${prefix}node_modules/${name}/index.mjs`]: `throw new Error('decoy ${name}');\n`,
    });

    return {
        ...decoy('@chamvi/core'),
        ...decoy('@chamvi/channel-cron'),
        ...decoy('ai'),
    };
}

function agentSource(name: string, typed: boolean): string {
    const any = typed ? ' as any' : '';

    return [
        'import { cron } from \'@chamvi/channel-cron\';',
        'import { defineAgent, defineTool, inject } from \'@chamvi/core\';',
        'import { jsonSchema } from \'ai\';',
        'const greet = defineTool({',
        '    description: \'Greets.\',',
        '    inputSchema: jsonSchema({ type: \'object\' }),',
        `    execute: async (_input${typed ? ': unknown' : ''}, { context }) => inject(context, (globalThis${any}).chamviGreetingKey),`,
        '});',
        `export default defineAgent({ name: '${name}', model: (globalThis${any}).chamviModels['${name}'], instructions: 'Greet.', tools: { greet }, channels: [cron.on('0 9 * * *')] });`,
        '',
    ].join('\n');
}

describe('package agents on the built packages', () => {
    let tmp: { path: string; remove: () => Promise<void> };

    beforeEach(async () => {
        // a temp dir: outside the app's tree, so @chamvi/core resolves only through the pin
        tmp = await createTempDir();
    });

    afterEach(async () => {
        await tmp.remove();
    });

    it('share the app\'s @chamvi/* and ai, built or linked TypeScript, beside copies of their own', async () => {
        const cwd = join(tmp.path, 'app');

        await writeTree(cwd, {
            'package.json': JSON.stringify({ name: 'app', private: true }),
            'node_modules/@fixture/built/package.json': JSON.stringify({
                name: '@fixture/built',
                version: '1.0.0',
                type: 'module',
                exports: './dist/index.mjs',
                files: ['dist'],
            }),
            'node_modules/@fixture/built/dist/index.mjs': agentSource('built-greeter', false),
            ...decoys('node_modules/@fixture/built/'),
        });
        await writeTree(join(tmp.path, 'ws/source'), {
            'package.json': JSON.stringify({
                name: '@fixture/source',
                version: '2.0.0',
                type: 'module',
                exports: './src/index.ts',
            }),
            'src/index.ts': agentSource('source-greeter', true),
            ...decoys(''),
        });
        await linkPackage(cwd, '@fixture/source', join(tmp.path, 'ws/source'));

        // the built @chamvi/app and @chamvi/core (nx runs this package's tests after its build)
        const { stdout } = await promisify(execFile)(process.execPath, [SCRIPT], { cwd, timeout: 30_000 });

        expect(JSON.parse(stdout.trim())).toEqual({
            'built-greeter': {
                status: 'completed',
                output: 'hello from the module',
                error: null,
                revision: '@fixture/built@1.0.0',
            },
            'source-greeter': {
                status: 'completed',
                output: 'hello from the module',
                error: null,
                revision: '@fixture/source@2.0.0',
            },
        });
    });
});
