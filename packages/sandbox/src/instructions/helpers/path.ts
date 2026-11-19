/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export const byteLength = (text: string): number => Buffer.byteLength(text, 'utf8');

/** Whether a normalized relative path names `.git` (any case) or something below it. */
export function isGitPath(path: string): boolean {
    return path.split('/').some((component) => component.toLowerCase() === '.git');
}

/** The first `count` components of a normalized relative path (`.` for none). */
export function pathPrefix(path: string, count: number): string {
    return count <= 0 ? '.' : path.split('/').slice(0, count).join('/');
}

/** The directories from the root down to `dir` (both included). */
export function directoryChain(dir: string): string[] {
    if (dir === '.') {
        return ['.'];
    }

    const components = dir.split('/');

    return ['.', ...components.map((_, index) => components.slice(0, index + 1).join('/'))];
}
