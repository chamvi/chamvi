/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/**
 * The user conditions of this process (`--conditions` / `-C`, `=value` or the
 * next argument), from `execArgv` and then `NODE_OPTIONS`, each once in
 * first-seen order: the conditions Node's own resolution adds to `node` and
 * `import`, so a package agent resolves like the code that imports it.
 */
export function userConditions(execArgv: readonly string[], nodeOptions: string | undefined): string[] {
    const conditions = new Set<string>();
    // each source on its own: a flag ending one never takes the next one's first argument
    const sources = [execArgv, (nodeOptions ?? '').split(/\s+/).filter((arg) => arg.length > 0)];

    for (const args of sources) {
        for (let index = 0; index < args.length; index++) {
            const match = /^(?:--conditions|-C)(?:=(.*))?$/.exec(args[index]!);

            if (match === null) {
                continue;
            }

            const value = match[1] ?? args[++index];

            if (value !== undefined && value.length > 0) {
                conditions.add(value);
            }
        }
    }

    return [...conditions];
}
