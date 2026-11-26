/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

describe('README', () => {
    it('contains the fixture app entry verbatim', () => {
        expect(read('README.md')).toContain(read('test/fixtures/app/src/index.ts'));
    });
});
