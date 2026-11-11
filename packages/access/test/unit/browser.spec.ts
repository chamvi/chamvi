/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../src/', import.meta.url));
const files = readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.ts'));

describe('browser safety', () => {
    it('finds the sources', () => {
        expect(files).toContain('index.ts');
    });

    it.each(files)('%s imports no node: module and uses no Buffer', (file) => {
        const source = readFileSync(`${root}${file}`, 'utf8');

        expect(source).not.toMatch(/from\s+['"]node:/);
        expect(source).not.toMatch(/import\(\s*['"]node:/);
        expect(source).not.toMatch(/\bBuffer\b/);
    });
});
