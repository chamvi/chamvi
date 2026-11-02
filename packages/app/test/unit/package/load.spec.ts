/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { join } from 'node:path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { hashAgentPackage, loadAgentPackage } from '@chamvi/app';
import { createTempDir, writeTree } from '../../utils/folder.ts';
import { installPackage, linkPackage, writePackage } from '../../utils/packages.ts';

describe('loadAgentPackage', () => {
    let tmp: { path: string; remove: () => Promise<void> };
    let cwd: string;

    beforeEach(async () => {
        // a temp dir outside the repo: nothing resolves through the workspace
        tmp = await createTempDir();
        cwd = join(tmp.path, 'app');
        await writeTree(cwd, { 'package.json': '{ "name": "app", "private": true }\n' });
    });

    afterEach(async () => {
        await tmp.remove();
    });

    it('resolves from the cwd and builds a single agent through defineAgent', async () => {
        const dir = await installPackage(cwd, '@s/greeter');
        const loaded = await loadAgentPackage('@s/greeter', { cwd });

        expect(loaded).toMatchObject({
            spec: '@s/greeter',
            name: '@s/greeter',
            version: '1.0.0',
            revision: '@s/greeter@1.0.0',
        });
        expect(loaded.formerRevision).toBeUndefined();
        expect(loaded.root.endsWith(join('node_modules', '@s', 'greeter'))).toBe(true);
        expect(loaded.root).toContain(dir.slice(dir.indexOf('node_modules')));
        expect(loaded.agents.map((agent) => agent.name)).toEqual(['greeter']);
        // the budget defaults of this defineAgent
        expect(loaded.agents[0]!.definition.budget).toMatchObject({ maxSteps: 20 });
    });

    it('takes the import condition and passes a nested package.json without a name', async () => {
        await installPackage(cwd, 'multi', {
            agents: ['a', 'b'],
            manifest: { exports: { '.': { import: './dist/index.mjs', require: './dist/index.cjs' } } },
            files: {
                'dist/package.json': '{ "type": "module" }\n',
                'dist/index.mjs': 'export default [{ name: \'a\', definition: { model: \'test/model\', instructions: \'x\' } }, { name: \'b\', definition: { model: \'test/model\', instructions: \'x\' } }];\n',
                'dist/index.cjs': 'throw new Error(\'require condition\');\n',
            },
        });

        const loaded = await loadAgentPackage('multi', { cwd });

        expect(loaded.agents.map((agent) => agent.name)).toEqual(['a', 'b']);
        expect(loaded.root.endsWith(join('node_modules', 'multi'))).toBe(true);
    });

    it('resolves a subpath of a package to the package root', async () => {
        await installPackage(cwd, '@s/agents', {
            manifest: { exports: { '.': './index.mjs', './triage': './triage.mjs' } },
            files: { 'triage.mjs': 'export default { name: \'triage\', definition: { model: \'test/model\', instructions: \'x\' } };\n' },
        });

        const loaded = await loadAgentPackage('@s/agents/triage', { cwd });

        expect(loaded).toMatchObject({
            spec: '@s/agents/triage',
            name: '@s/agents',
            revision: '@s/agents@1.0.0',
        });
        expect(loaded.agents.map((agent) => agent.name)).toEqual(['triage']);
    });

    it('marks dev revisions with the content hash and keeps the version marker as the former one', async () => {
        await writePackage(join(tmp.path, 'ws/greeter'), '@s/greeter', { version: '0.3.0' });
        await linkPackage(cwd, '@s/greeter', join(tmp.path, 'ws/greeter'));

        const loaded = await loadAgentPackage('@s/greeter', { cwd, dev: true });
        const hash = await hashAgentPackage(join(tmp.path, 'ws/greeter'));

        expect(loaded.root).toBe(await import('node:fs/promises').then((fs) => fs.realpath(join(tmp.path, 'ws/greeter'))));
        expect(loaded.revision).toBe(`@s/greeter@0.3.0+${hash.slice(0, 12)}`);
        expect(loaded.formerRevision).toBe('@s/greeter@0.3.0');
    });

    it('hashes the source a linked package exports outside its files field', async () => {
        const dir = join(tmp.path, 'ws/greeter');

        await writePackage(dir, '@s/greeter', {
            manifest: { files: ['dist'], exports: './src/index.mjs' },
            files: {
                'src/index.mjs': 'export { default } from \'./agent.mjs\';\n',
                'src/agent.mjs': 'export default { name: \'greeter\', definition: { model: \'test/model\', instructions: \'v1\' } };\n',
            },
        });
        await linkPackage(cwd, '@s/greeter', dir);

        // the import is stubbed: Node caches the entry, a new process would not
        const importer = () => Promise.resolve({ default: { name: 'greeter', definition: { model: 'test/model', instructions: 'x' } } });
        const before = await loadAgentPackage('@s/greeter', {
            cwd,
            dev: true,
            importer,
        });

        await writeTree(dir, { 'src/agent.mjs': 'export default { name: \'greeter\', definition: { model: \'test/model\', instructions: \'v2\' } };\n' });

        const after = await loadAgentPackage('@s/greeter', {
            cwd,
            dev: true,
            importer,
        });

        expect(after.revision).not.toBe(before.revision);
    });

    it.each([
        ['no default export', 'export const agent = 1;\n', '@s/bad: has no default export.'],
        ['an empty array', 'export default [];\n', '@s/bad: the default export must be defineAgent(...)\'s result or a non-empty array of them.'],
        ['another shape', 'export default { name: 1 };\n', '@s/bad: the default export must be defineAgent(...)\'s result or a non-empty array of them.'],
        [
            'one name twice',
            'const a = { name: \'a\', definition: { model: \'m/x\', instructions: \'x\' } };\nexport default [a, a];\n',
            '@s/bad: exports the agent "a" twice.',
        ],
        ['a throwing module', 'throw new Error(\'boom\');\n', '@s/bad: boom'],
    ])('refuses %s, naming the specifier', async (_label, source, message) => {
        await installPackage(cwd, '@s/bad', { files: { 'index.mjs': source } });
        await expect(loadAgentPackage('@s/bad', { cwd })).rejects.toThrow(message);
    });

    it('refuses an agent defineAgent refuses', async () => {
        await installPackage(cwd, '@s/bad', { files: { 'index.mjs': 'export default { name: \'Bad Name\', definition: { model: \'m/x\', instructions: \'x\' } };\n' } });

        const attempt = loadAgentPackage('@s/bad', { cwd });

        await expect(attempt).rejects.toThrow(InvalidAgentDefinitionError);
        await expect(loadAgentPackage('@s/bad', { cwd })).rejects.toThrow(/^@s\/bad: /);
    });

    it('refuses a package without a version', async () => {
        await installPackage(cwd, '@s/nover', { version: null });
        await expect(loadAgentPackage('@s/nover', { cwd })).rejects.toThrow(
            '@s/nover: the package.json of @s/nover has no version; a package agent\'s revision is its version.',
        );
    });

    it('refuses a revision wider than the store column', async () => {
        await installPackage(cwd, 'pkg', { version: `1.0.0-${'a'.repeat(130)}` });
        await expect(loadAgentPackage('pkg', { cwd })).rejects.toThrow('is longer than 128 characters.');
    });

    it('says to add a missing package to the dependencies', async () => {
        await expect(loadAgentPackage('@s/missing', { cwd })).rejects.toThrow(
            '@s/missing: not found from the app\'s directory; add it to the app\'s dependencies.',
        );
    });

    it('names paths relative to the cwd', async () => {
        await installPackage(cwd, '@s/bad', { files: { 'index.mjs': 'import \'./missing.mjs\';\nexport default 1;\n' } });

        const error = await loadAgentPackage('@s/bad', { cwd }).then(() => new Error('loaded'), (e: unknown) => e as Error);

        expect(error.message.startsWith('@s/bad: ')).toBe(true);
        expect(error.message).not.toContain(tmp.path);
    });

    it('hints at a build when Node refuses to strip types below node_modules', async () => {
        await installPackage(cwd, '@s/source');

        const attempt = loadAgentPackage('@s/source', {
            cwd,
            importer: async () => {
                throw Object.assign(new Error('Stripping types is unsupported.'), { code: 'ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING' });
            },
        });

        await expect(attempt).rejects.toThrow(
            '@s/source: Stripping types is unsupported. Build the package to JavaScript, or link it from a workspace.',
        );
    });

    it('hands the entry URL to an importer', async () => {
        await installPackage(cwd, '@s/greeter');

        const urls: string[] = [];
        const loaded = await loadAgentPackage('@s/greeter', {
            cwd,
            importer: async (url) => {
                urls.push(url);

                return { default: { name: 'injected', definition: { model: 'm/x', instructions: 'x' } } };
            },
        });

        expect(urls).toHaveLength(1);
        expect(urls[0]).toMatch(/^file:.*index\.mjs$/);
        expect(loaded.agents.map((agent) => agent.name)).toEqual(['injected']);
    });
});
