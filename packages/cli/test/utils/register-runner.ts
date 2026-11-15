/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/*
 * Run by the transform specs in a child `node` (the hooks must not leak into
 * the Vitest process): `node register-runner.ts <cwd> <entry> [--twice]`.
 * Registers the TypeScript hooks for `<cwd>` (twice with `--twice`), imports
 * `<entry>` and prints one JSON line: how often `registerHooks` was called,
 * how often each URL was transformed, the probe of the decorated fixture's
 * exports, or the error.
 */

import nodeModule from 'node:module';
import type { LoadHookSync, RegisterHooksOptions } from 'node:module';
import { pathToFileURL } from 'node:url';
import { useDecoratorMeta } from '@routup/decorators';

type Report = {
    registrations: number;
    transforms: Record<string, number>;
    probe?: Record<string, unknown>;
    error?: {
        code?: unknown;
        message: string;
        stack?: string;
    };
};

const [cwd = '', entry = '', ...flags] = process.argv.slice(2);
const report: Report = { registrations: 0, transforms: {} };

/** Counts the load hook's transforms: a result that is not the one `nextLoad` gave. */
function countTransforms(load: LoadHookSync): LoadHookSync {
    return (url, context, nextLoad) => {
        let next: unknown;
        const result = load(url, context, (nextUrl, nextContext) => {
            next = nextLoad(nextUrl, nextContext);

            return next as ReturnType<typeof nextLoad>;
        });

        if (result !== next) {
            report.transforms[url] = (report.transforms[url] ?? 0) + 1;
        }

        return result;
    };
}

const target = nodeModule as unknown as { registerHooks: typeof nodeModule.registerHooks };
const { registerHooks } = target;

target.registerHooks = (options: RegisterHooksOptions) => {
    report.registrations++;

    return registerHooks({
        ...options,
        load: options.load ? countTransforms(options.load) : undefined,
    });
};
// the named export `registerHooks` the CLI imports follows the patched default
nodeModule.syncBuiltinESMExports();

function probe(exports: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const {
        NoteController,
        NoteStatus,
        COLUMNS,
    } = exports as {
        NoteController?: new () => { fail(): unknown };
        NoteStatus?: Record<string, string>;
        COLUMNS?: Record<string, string>;
    };

    if (NoteController) {
        result.url = useDecoratorMeta(NoteController.prototype).url;

        try {
            new NoteController().fail();
        } catch (error) {
            result.stack = (error as Error).stack;
        }
    }

    result.status = NoteStatus?.Open;
    result.columns = COLUMNS;

    return result;
}

try {
    const { registerTypeScriptHooks } = await import('../../src/transform/index.ts');

    await registerTypeScriptHooks({ cwd });

    if (flags.includes('--twice')) {
        await registerTypeScriptHooks({ cwd });
    }

    const exports = await import(pathToFileURL(entry).href) as Record<string, unknown>;

    report.probe = probe(exports);
} catch (error) {
    const {
        code,
        message,
        stack,
    } = error as Error & { code?: unknown };

    report.error = {
        code,
        message,
        stack,
    };
}

process.stdout.write(`${JSON.stringify(report)}\n`);
