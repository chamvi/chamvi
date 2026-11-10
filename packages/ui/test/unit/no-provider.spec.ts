/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PROVIDERS = ['chat-whatsapp', 'chat-discord', 'tool-mail', 'tool-calendar', '@chamvi/github'];

function* files(dir: string): Generator<string> {
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);

        if (statSync(path).isDirectory()) {
            yield* files(path);
        } else {
            yield path;
        }
    }
}

describe('@chamvi/ui source names no provider package', () => {
    it.each(['app', 'src'])('%s/', (dir) => {
        const found: string[] = [];

        for (const path of files(join(ROOT, dir))) {
            const text = readFileSync(path, 'utf8');

            for (const provider of PROVIDERS) {
                if (text.includes(provider)) {
                    found.push(`${path}: ${provider}`);
                }
            }
        }

        expect(found).toEqual([]);
    });
});
