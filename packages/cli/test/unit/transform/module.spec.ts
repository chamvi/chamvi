/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { spawnSync } from 'node:child_process';
import {
    mkdir,
    mkdtemp,
    readFile,
    rm,
    writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
    afterAll,
    beforeAll,
    describe,
    expect,
    it,
} from 'vitest';
import { isTypeScriptFile } from '../../../src/transform/index.ts';

const RUNNER = fileURLToPath(new URL('../../utils/register-runner.ts', import.meta.url));
const FIXTURE = fileURLToPath(new URL('../../fixtures/decorated', import.meta.url));
const ENTRY = path.join(FIXTURE, 'src', 'index.ts');
const CONTROLLER = path.join(FIXTURE, 'src', 'controller.ts');

type Report = {
    registrations: number;
    transforms: Record<string, number>;
    probe?: {
        url?: unknown;
        stack?: string;
        status?: unknown;
        columns?: Record<string, string>;
    };
    error?: {
        code?: unknown;
        message: string;
        stack?: string;
    };
};

/** Runs the runner in a child `node`, so the hooks stay out of this process. */
function run(cwd: string, entry: string, flags: string[] = []): Report {
    const result = spawnSync(process.execPath, [RUNNER, cwd, entry, ...flags], {
        cwd,
        encoding: 'utf8',
        env: { PATH: process.env.PATH, HOME: process.env.HOME },
        timeout: 20_000,
    });
    const line = result.stdout.trim().split('\n').pop() ?? '';

    try {
        return JSON.parse(line) as Report;
    } catch {
        throw new Error(`the runner printed no report (exit ${result.status}):\n${result.stdout}${result.stderr}`);
    }
}

describe('isTypeScriptFile', () => {
    it('is true for .ts, .mts and .cts', () => {
        expect(isTypeScriptFile('/app/src/index.ts')).toBe(true);
        expect(isTypeScriptFile('/app/src/index.mts')).toBe(true);
        expect(isTypeScriptFile('/app/src/index.cts')).toBe(true);
        expect(isTypeScriptFile('src/index.TS')).toBe(false);
    });

    it('is false for declarations and JavaScript', () => {
        expect(isTypeScriptFile('/app/src/types.d.ts')).toBe(false);
        expect(isTypeScriptFile('/app/src/types.d.mts')).toBe(false);
        expect(isTypeScriptFile('/app/dist/index.mjs')).toBe(false);
        expect(isTypeScriptFile('/app/dist/index.js')).toBe(false);
        expect(isTypeScriptFile('/app/src/ts')).toBe(false);
    });
});

describe('registerTypeScriptHooks', () => {
    let scratch: string;

    beforeAll(async () => {
        scratch = await mkdtemp(path.join(tmpdir(), 'chamvi-transform-'));
    });

    afterAll(async () => {
        await rm(scratch, { recursive: true, force: true });
    });

    it('loads a decorated entry with the cwd tsconfig: controller meta, design:type and enums', () => {
        const report = run(FIXTURE, ENTRY);

        expect(report.error).toBeUndefined();
        expect(report.probe?.url).toBe('/notes');
        expect(report.probe?.columns).toEqual({ title: 'String' });
        expect(report.probe?.status).toBe('open');
    });

    it('fails on the decorated file with a tsconfig without experimentalDecorators, as the build does', () => {
        const report = run(path.join(FIXTURE, 'tsconfigs', 'plain'), ENTRY);

        // rolldown keeps the decorator syntax, which Node does not parse
        expect(report.error?.stack).toMatch(/^SyntaxError/);
        expect(report.transforms[pathToFileURL(CONTROLLER).href]).toBe(1);
        expect(report.probe).toBeUndefined();
    });

    it('follows a tsconfig that extends the one carrying the flags', () => {
        const report = run(path.join(FIXTURE, 'tsconfigs', 'extends'), ENTRY);

        expect(report.error).toBeUndefined();
        expect(report.probe?.url).toBe('/notes');
        expect(report.probe?.columns).toEqual({ title: 'String' });
    });

    it('reports the TypeScript line of a throw in the stack', async () => {
        const lines = (await readFile(CONTROLLER, 'utf8')).split('\n');
        const line = lines.findIndex((text) => text.includes('throw new Error')) + 1;

        const report = run(FIXTURE, ENTRY);

        expect(line).toBeGreaterThan(0);
        expect(report.probe?.stack).toContain(`controller.ts:${line}:`);
    });

    it('fails a syntax error with the file and line', async () => {
        // in a module package, as an app is: Node then leaves the parse to the hook
        const dir = path.join(scratch, 'broken');
        const file = path.join(dir, 'index.ts');

        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, 'package.json'), '{ "type": "module" }\n');
        await writeFile(file, 'export const value = 1;\n\nexport const broken = ;\n');

        const report = run(FIXTURE, file);

        expect(report.error?.message).toContain(`${file}:3:`);
    });

    it('leaves a TypeScript file under node_modules to Node', async () => {
        const dir = path.join(scratch, 'node_modules', 'typed');
        const file = path.join(dir, 'index.ts');

        await mkdir(dir, { recursive: true });
        await writeFile(file, 'export const value: number = 1;\n');

        const report = run(FIXTURE, file);

        expect(report.error?.code).toBe('ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING');
        expect(report.transforms[pathToFileURL(file).href]).toBeUndefined();
    });

    it('registers once per process and transforms each file once', () => {
        const report = run(FIXTURE, ENTRY, ['--twice']);

        expect(report.error).toBeUndefined();
        expect(report.registrations).toBe(1);

        const files = ['index.ts', 'controller.ts', 'entity.ts'].map((name) => pathToFileURL(path.join(FIXTURE, 'src', name)).href);

        for (const file of files) {
            expect(report.transforms[file]).toBe(1);
        }
    });

    it('is a usage error when tsdown does not resolve from cwd', () => {
        const report = run(scratch, ENTRY);

        expect(report.error?.code).toBe('cli_usage');
        expect(report.error?.message).toMatch(/^The entry is TypeScript: install tsdown \^0\.23\.\d+ to load it\.$/);
    });
});
