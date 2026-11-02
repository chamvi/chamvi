/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import type { ArtifactTile } from '../../../../app/artifacts/types.ts';
import ArtifactStrip from '../../../../app/components/artifact-strip/ArtifactStrip.vue';

function render(tiles: ArtifactTile[]): Promise<string> {
    return renderToString(createSSRApp(ArtifactStrip, { tiles }));
}

function tagsOf(html: string, testid: string): string[] {
    return html.match(new RegExp(`<[a-z]+[^>]*data-testid="${testid}"[^>]*>[\\s\\S]*?</(?:figure|button|div)>`, 'g')) ?? [];
}

describe('ArtifactStrip', () => {
    it('renders a thumbnail per raster id with its filename', async () => {
        const html = await render([
            {
                id: 'a',
                name: 'button-actual.png',
                mediaType: 'image/png',
                status: 'image',
                url: 'blob:test/1',
            },
            {
                id: 'b',
                name: 'button-diff.png',
                mediaType: 'image/png',
                status: 'image',
                url: 'blob:test/2',
            },
        ]);

        expect(html).toContain('data-testid="artifact-strip"');
        expect(html.match(/<img[^>]*>/g)).toEqual([
            expect.stringContaining('src="blob:test/1"'),
            expect.stringContaining('src="blob:test/2"'),
        ]);
        expect(html).toContain('alt="button-actual.png"');
        expect(html).toContain('<figcaption class="artifact-name mono">button-actual.png</figcaption>');
        expect(html).toContain('<figcaption class="artifact-name mono">button-diff.png</figcaption>');
    });

    it('renders image/svg+xml and application/pdf as download links, never as images or new tabs', async () => {
        const html = await render([
            {
                id: 'b',
                name: 'logo.svg',
                mediaType: 'image/svg+xml',
                status: 'file',
            },
            {
                id: 'c',
                name: 'report.pdf',
                mediaType: 'application/pdf',
                status: 'file',
            },
        ]);

        expect(html).not.toContain('<img');
        expect(html).not.toContain('target=');
        expect(html).not.toContain('href=');
        expect(tagsOf(html, 'artifact-download')).toHaveLength(2);
        // each button names its file for screen readers, not only "Download"
        expect(html).toContain('aria-label="Download logo.svg"');
        expect(html).toContain('aria-label="Download report.pdf"');
        expect(html).toContain('logo.svg');
        expect(html).toContain('report.pdf');
    });

    it('shows a placeholder with the filename when a fetch fails', async () => {
        const html = await render([{
            id: 'd',
            name: 'gone.webp',
            mediaType: 'image/webp',
            status: 'missing',
        }]);

        expect(html).not.toContain('<img');
        expect(html).toContain('data-status="missing"');
        expect(html).toContain('gone.webp');
        expect(html).toContain('Not available');
    });

    it('shows a loading placeholder until the bytes arrive', async () => {
        const html = await render([{
            id: 'a',
            name: 'a',
            status: 'loading',
        }]);

        expect(html).not.toContain('<img');
        expect(html).toContain('data-status="loading"');
    });

    it('renders nothing without tiles', async () => {
        expect(await render([])).toBe('<!---->');
    });
});
