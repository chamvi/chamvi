/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { IconifyJSON } from '@iconify/types';
import { getIcons } from '@iconify/utils';
import lucide from '@vuecs/icons-lucide';
import type { Plugin } from 'vite';
import { ICONS_ID } from './constants.ts';

/**
 * The Lucide icons the vuecs preset names, bundled as one small Iconify
 * collection: Iconify would otherwise fetch them from api.iconify.design,
 * which the dashboard's CSP (connect-src 'self') refuses.
 */
export function iconsPlugin(): Plugin {
    return {
        name: 'chamvi-icons',
        resolveId: (id) => (id === ICONS_ID ? `\0${ICONS_ID}` : undefined),
        load(id) {
            if (id !== `\0${ICONS_ID}`) {
                return undefined;
            }

            const names = new Set<string>(['x', 'check']);
            const collect = (value: unknown): void => {
                if (typeof value === 'string' && value.startsWith('lucide:')) {
                    names.add(value.slice('lucide:'.length));
                } else if (value && typeof value === 'object') {
                    Object.values(value).forEach(collect);
                }
            };

            collect(lucide().defaults);

            const path = createRequire(import.meta.url).resolve('@iconify-json/lucide/icons.json');
            const collection = JSON.parse(readFileSync(path, 'utf8')) as IconifyJSON;
            const subset = getIcons(collection, [...names].sort(), true);

            if (!subset) {
                throw new Error('lucide icons missing');
            }

            return `export default ${JSON.stringify(subset)};`;
        },
    };
}
