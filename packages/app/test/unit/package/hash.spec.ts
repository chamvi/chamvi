/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { cp, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import { hashAgentPackage } from '@chamvi/app';
import { createTempDir, writeTree } from '../../utils/folder.ts';
import { linkPackage } from '../../utils/packages.ts';

const manifest = (fields: Record<string, unknown>) => `${JSON.stringify({
    name: '@s/pkg', 
    version: '1.0.0', 
    ...fields, 
}, null, 2)}\n`;

describe('hashAgentPackage', () => {
    let tmp: { path: string; remove: () => Promise<void> };
    let root: string;

    beforeEach(async () => {
        tmp = await createTempDir();
        root = join(tmp.path, 'pkg');
    });

    afterEach(async () => {
        await tmp.remove();
    });

    describe('with a files field', () => {
        beforeEach(async () => {
            await writeTree(root, {
                'package.json': manifest({ files: ['dist', '!dist/*.map'] }),
                'dist/index.mjs': 'export default 1;\n',
                'dist/index.mjs.map': '{}',
                'src/index.ts': 'export default 1;\n',
                'test/a.spec.ts': 'x',
                'README.md': '# pkg',
                'CHANGELOG.md': '# changes',
                'node_modules/dep/index.js': 'x',
                '.npmrc': 'x',
            });
        });

        it.each([
            ['test/a.spec.ts', 'y'],
            ['src/index.ts', 'export default 2;\n'],
            ['README.md', '# other'],
            ['CHANGELOG.md', '# more'],
            ['node_modules/dep/index.js', 'y'],
            ['.npmrc', 'y'],
            ['dist/index.mjs.map', '{"x":1}'],
        ])('ignores a change of %s', async (file, content) => {
            const before = await hashAgentPackage(root);

            await writeTree(root, { [file]: content });
            expect(await hashAgentPackage(root)).toBe(before);
        });

        it('counts a change below a listed folder', async () => {
            const before = await hashAgentPackage(root);

            await writeTree(root, { 'dist/index.mjs': 'export default 2;\n' });
            expect(await hashAgentPackage(root)).not.toBe(before);
        });

        it('ignores the version and the formatting of package.json, not its other fields', async () => {
            const before = await hashAgentPackage(root);

            await writeTree(root, {
                'package.json': JSON.stringify({
                    name: '@s/pkg', 
                    version: '2.0.0', 
                    files: ['dist', '!dist/*.map'], 
                }), 
            });
            expect(await hashAgentPackage(root)).toBe(before);

            await writeTree(root, { 'package.json': manifest({ files: ['dist', '!dist/*.map'], dependencies: { ai: '^7.0.0' } }) });
            expect(await hashAgentPackage(root)).not.toBe(before);
        });

        it('counts main outside the files field', async () => {
            await writeTree(root, { 'package.json': manifest({ files: ['dist'], main: './lib/main.js' }), 'lib/main.js': 'a' });

            const before = await hashAgentPackage(root);

            await writeTree(root, { 'lib/main.js': 'b' });
            expect(await hashAgentPackage(root)).not.toBe(before);
        });
    });

    describe('without a files field', () => {
        beforeEach(async () => {
            await writeTree(root, {
                'package.json': manifest({}),
                'index.mjs': 'export default 1;\n',
                'src/tool.ts': 'x',
                'test/a.spec.ts': 'x',
                'lib/test/helper.ts': 'x',
            });
        });

        it('ignores a top-level test folder', async () => {
            const before = await hashAgentPackage(root);

            await writeTree(root, { 'test/a.spec.ts': 'y' });
            expect(await hashAgentPackage(root)).toBe(before);
        });

        it.each(['src/tool.ts', 'lib/test/helper.ts', 'index.mjs'])('counts %s', async (file) => {
            const before = await hashAgentPackage(root);

            await writeTree(root, { [file]: 'changed' });
            expect(await hashAgentPackage(root)).not.toBe(before);
        });
    });

    it('hashes a symlinked workspace package like its copy', async () => {
        await writeTree(join(tmp.path, 'ws/pkg'), {
            'package.json': manifest({ files: ['dist'] }),
            'dist/index.mjs': 'export default 1;\n',
            'node_modules/.bin/x': 'x',
        });

        const link = await linkPackage(join(tmp.path, 'app'), '@s/pkg', join(tmp.path, 'ws/pkg'));

        await cp(join(tmp.path, 'ws/pkg'), join(tmp.path, 'image/pkg'), { recursive: true });

        const real = await hashAgentPackage(await realpath(link));

        expect(real).toBe(await hashAgentPackage(join(tmp.path, 'ws/pkg')));
        expect(real).toBe(await hashAgentPackage(join(tmp.path, 'image/pkg')));
        expect(real).toMatch(/^[0-9a-f]{64}$/);
    });
});
