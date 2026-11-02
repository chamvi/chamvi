/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { mkdir, symlink } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { writeTree } from './folder.ts';

export type FixturePackageOptions = {
    version?: string | null;
    /** `package.json` fields merged over the defaults. */
    manifest?: Record<string, unknown>;
    /** Extra files below the package root. */
    files?: Record<string, string>;
    /** The agents its `index.mjs` default-exports (structural shapes), by name; one name: a single agent. */
    agents?: string[];
    /** The model string of its agents. */
    model?: string;
    /** Extra source of each agent's definition (e.g. `, channels: [...]`). */
    extra?: string;
};

/** A structural agent as a source expression. */
export function agentSource(name: string, model = 'test/model', extra = ''): string {
    return `{ name: '${name}', definition: { model: '${model}', instructions: 'from package'${extra} } }`;
}

/**
 * Writes an ESM agent package to `dir` (`package.json` with `exports`
 * `./index.mjs`, an `index.mjs` default-exporting structural agents).
 */
export async function writePackage(dir: string, name: string, options: FixturePackageOptions = {}): Promise<void> {
    const agents = options.agents ?? ['greeter'];
    const sources = agents.map((agent) => agentSource(agent, options.model, options.extra));
    const exported = sources.length === 1 ? sources[0] : `[${sources.join(', ')}]`;
    const manifest: Record<string, unknown> = {
        name,
        ...(options.version !== null && { version: options.version ?? '1.0.0' }),
        type: 'module',
        exports: './index.mjs',
        ...options.manifest,
    };

    await writeTree(dir, {
        'package.json': `${JSON.stringify(manifest, null, 2)}\n`,
        'index.mjs': `export default ${exported};\n`,
        ...options.files,
    });
}

/** Writes a package into `<cwd>/node_modules/<name>`. */
export async function installPackage(cwd: string, name: string, options: FixturePackageOptions = {}): Promise<string> {
    const dir = join(cwd, 'node_modules', ...name.split('/'));

    await writePackage(dir, name, options);

    return dir;
}

/** Links `<cwd>/node_modules/<name>` to `target` (a workspace package), relative like npm. */
export async function linkPackage(cwd: string, name: string, target: string): Promise<string> {
    const link = join(cwd, 'node_modules', ...name.split('/'));

    await mkdir(dirname(link), { recursive: true });
    await symlink(relative(dirname(link), target), link, 'dir');

    return link;
}
