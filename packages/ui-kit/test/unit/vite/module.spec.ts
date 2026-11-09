/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { definePageConfig } from '@chamvi/ui-kit/vite';
import type { Plugin } from 'vite';

function plugins(config: ReturnType<typeof definePageConfig>): Plugin[] {
    return (config.plugins as unknown[]).flat(3) as Plugin[];
}

function pluginNames(config: ReturnType<typeof definePageConfig>): string[] {
    return plugins(config).map((plugin) => plugin.name);
}

function iconsPlugin(config: ReturnType<typeof definePageConfig>): Plugin {
    return plugins(config).find((plugin) => plugin.name === 'chamvi-icons') as Plugin;
}

describe('definePageConfig', () => {
    it('carries the root, Vue, Tailwind and the icon plugin', () => {
        const config = definePageConfig({ root: 'app' });
        const names = pluginNames(config);

        expect(config.root).toBe('app');
        expect(names).toContain('vite:vue');
        expect(names.some((name) => name.startsWith('@tailwindcss/vite'))).toBe(true);
        expect(names).toContain('chamvi-icons');
    });

    it('never inlines a font: font-src self refuses data: URIs', () => {
        const limit = definePageConfig({ root: 'app' }).build?.assetsInlineLimit as (file: string, content: Buffer) => boolean | undefined;

        expect(limit('a.woff2', Buffer.alloc(1))).toBe(false);
        expect(limit('a.png', Buffer.alloc(1))).toBeUndefined();
    });

    it('bundles the icons the vuecs preset names', () => {
        const plugin = iconsPlugin(definePageConfig({ root: 'app' }));
        const resolveId = plugin.resolveId as (id: string) => string | undefined;
        const load = plugin.load as (id: string) => string | undefined;
        const id = resolveId('virtual:chamvi-icons');

        expect(id).toBe('\0virtual:chamvi-icons');
        expect(resolveId('other')).toBeUndefined();
        expect(load('other')).toBeUndefined();

        const collection = JSON.parse(load(id!)!.replace(/^export default /, '').replace(/;$/, '')) as {
            prefix: string;
            icons: Record<string, unknown>;
        };

        expect(collection.prefix).toBe('lucide');
        expect(Object.keys(collection.icons)).toEqual(expect.arrayContaining(['x', 'check']));
    });
});
