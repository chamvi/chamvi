/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import type { UserConfig } from 'vite';
import { iconsPlugin } from './icons.ts';
import type { DefinePageConfigOptions } from './types.ts';

/** The Vite config of a page on the kit: Vue, Tailwind, the bundled icons, the output under `dist/app`. */
export function definePageConfig(options: DefinePageConfigOptions): UserConfig {
    return {
        root: options.root,
        base: './',
        plugins: [vue(), tailwindcss(), iconsPlugin()],
        build: {
            outDir: '../dist/app',
            emptyOutDir: true,
            assetsDir: 'assets',
            // vuecs, reka-ui and the icon set in one entry chunk
            chunkSizeWarningLimit: 1500,
            // a font subset under 4 KiB would become a data: URI, which font-src 'self' refuses
            assetsInlineLimit: (file) => (file.endsWith('.woff2') ? false : undefined),
        },
    };
}
