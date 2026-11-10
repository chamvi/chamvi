/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import {
    afterAll,
    beforeAll,
    describe,
    expect,
    it,
} from 'vitest';
import { envSecret } from '@chamvi/app';

const SECRET = 'pa55-w0rd-never-echoed';

let dir: string;

beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'chamvi-env-secret-'));
});

afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
});

function errorOf(fn: () => unknown): Error {
    try {
        fn();
    } catch (error) {
        return error as Error;
    }

    throw new Error('expected a throw');
}

describe('envSecret()', () => {
    it('treats empty as unset', () => {
        expect(envSecret({}, 'X')).toBeUndefined();
        expect(envSecret({ X: '', X_FILE: '' }, 'X')).toBeUndefined();
    });

    it('reads the plain variable, also beside an empty _FILE', () => {
        expect(envSecret({ X: SECRET }, 'X')).toBe(SECRET);
        expect(envSecret({ X: SECRET, X_FILE: '' }, 'X')).toBe(SECRET);
    });

    it('reads a _FILE and trims one newline', async () => {
        const file = join(dir, 'lf');

        await writeFile(file, `${SECRET}\n`);

        expect(envSecret({ X_FILE: file }, 'X')).toBe(SECRET);
        expect(envSecret({ X: '', X_FILE: file }, 'X')).toBe(SECRET);
    });

    it('trims only one trailing newline of a file', async () => {
        const file = join(dir, 'crlf');

        await writeFile(file, 'value\n\r\n');

        expect(envSecret({ X_FILE: file }, 'X')).toBe('value\n');
    });

    it('fails naming the variable when both are set', () => {
        const error = errorOf(() => envSecret({ X: SECRET, X_FILE: '/run/secret' }, 'X'));

        expect(error).toBeInstanceOf(InvalidAgentDefinitionError);
        expect(error.message).toContain('X and X_FILE');
        expect(error.message).not.toContain(SECRET);
    });

    it('fails naming the variable for an unreadable file, never its path', () => {
        const file = join(dir, 'missing');
        const error = errorOf(() => envSecret({ X_FILE: file }, 'X'));

        expect(error).toBeInstanceOf(InvalidAgentDefinitionError);
        expect(error.message).toContain('X_FILE');
        expect(error.message).not.toContain(file);
    });

    it('refuses an empty file', async () => {
        const file = join(dir, 'empty');

        await writeFile(file, '\n');

        expect(() => envSecret({ X_FILE: file }, 'X')).toThrow(/X_FILE/);
    });
});
