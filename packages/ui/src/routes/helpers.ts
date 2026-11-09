/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderStaticIndex } from '@chamvi/http';
import type { UiConfig } from '../config/types.ts';

/** `index.html` with the config marker replaced by `<base href="<uiBase>/">` and the config as a JSON script block. */
export function renderIndex(html: string, config: UiConfig): string {
    return renderStaticIndex(html, config, config.uiBase);
}

/**
 * The package's build: `dist/app` next to the built entry (`dist/index.mjs`),
 * else seen from the sources (`src/routes`); the first that holds an
 * `index.html`, else the built entry's.
 */
export function defaultRoot(): string {
    const candidates = [
        fileURLToPath(new URL('./app/', import.meta.url)),
        fileURLToPath(new URL('../../dist/app/', import.meta.url)),
    ];

    return candidates.find((candidate) => existsSync(join(candidate, 'index.html'))) ?? candidates[0]!;
}
