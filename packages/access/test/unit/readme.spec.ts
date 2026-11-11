/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checks } from '../fixtures/readme-example.ts';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('README example', () => {
    it('is the code of test/fixtures/readme-example.ts', () => {
        const readme = read('../../README.md');
        const blocks = Array.from(readme.matchAll(/```typescript\n([\s\S]*?)```/g), (m) => m[1]);

        expect(blocks).toContain(read('../fixtures/readme-example.ts'));
    });

    it('answers the unrestricted and the restricted check', async () => {
        await expect(checks()).resolves.toEqual({
            runTriage: true,
            readTriage: true,
            readOther: false,
            readSome: true,
        });
    });
});
