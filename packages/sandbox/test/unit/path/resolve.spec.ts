/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { ValidationError } from '@chamvi/errors';
import { absoluteWorkspacePath, resolveWorkspacePath } from '@chamvi/sandbox';

describe('resolveWorkspacePath', () => {
    it.each([
        ['src/a.ts', 'src/a.ts'],
        ['./src//a.ts', 'src/a.ts'],
        ['/workspace/src/a.ts', 'src/a.ts'],
        ['/workspace', '.'],
        ['/workspace/', '.'],
        ['/workspace//src', 'src'],
        ['/workspace//', '.'],
        ['.', '.'],
        ['./', '.'],
        ['a/../b', 'b'],
        ['src/', 'src'],
        [':a', ':a'],
    ])('accepts %j as %j', (input, expected) => {
        expect(resolveWorkspacePath(input)).toBe(expected);
    });

    it.each([
        '../x',
        '..',
        'a/../../x',
        '/etc/passwd',
        '/workspace/../etc',
        '/workspace//../etc',
        '/workspacex/a',
        '/',
        '',
        'a\0b',
    ])('rejects %j', (input) => {
        expect(() => resolveWorkspacePath(input)).toThrow(ValidationError);
    });

    it('rejects a non-string', () => {
        expect(() => resolveWorkspacePath(42 as unknown as string)).toThrow(ValidationError);
    });
});

describe('absoluteWorkspacePath', () => {
    it('puts a relative path under the workspace root', () => {
        expect(absoluteWorkspacePath('.')).toBe('/workspace');
        expect(absoluteWorkspacePath('src/a.ts')).toBe('/workspace/src/a.ts');
    });
});
