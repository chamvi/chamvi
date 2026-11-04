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

const SCRIPT = fileURLToPath(new URL('../../fixtures/identity/run.mjs', import.meta.url));

describe('a folder agent on the built packages', () => {
    let root: { path: string; remove: () => Promise<void> };

    beforeEach(async () => {
        // a temp dir: outside the app's tree, so @chamvi/core resolves only through the loader's pin
        root = await createTempDir();
    });

    afterEach(async () => {
        await root.remove();
    });

    it('injects a context key a module provided (one @chamvi/core instance)', async () => {
        await writeTree(join(root.path, 'greeter'), {
            'agent.ts': 'import { cron } from \'@chamvi/channel-cron\';\nimport { defineModelAgent } from \'@chamvi/core\';\nimport greet from \'./tools/greet.ts\';\nexport default defineModelAgent({ name: \'greeter\', model: (globalThis as any).chamviModel, instructions: \'Greet.\', tools: { greet }, channels: [cron.on(\'0 9 * * *\')] });\n',
            'tools/greet.ts': [
                'import { defineTool, inject } from \'@chamvi/core\';',
                'import { jsonSchema } from \'ai\';',
                'export default defineTool({',
                '    description: \'Greets.\',',
                '    inputSchema: jsonSchema({ type: \'object\' }),',
                '    execute: async (_input, { context }) => inject(context, (globalThis as any).chamviGreetingKey),',
                '});',
                '',
            ].join('\n'),
        });

        // the built @chamvi/app and @chamvi/core (nx runs this package's tests after its build)
        const { stdout } = await promisify(execFile)(process.execPath, [SCRIPT, root.path], { timeout: 30_000 });

        expect(JSON.parse(stdout.trim())).toEqual({
            status: 'completed',
            output: 'hello from the module',
            error: null,
        });
    });
});
