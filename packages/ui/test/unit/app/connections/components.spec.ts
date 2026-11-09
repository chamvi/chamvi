/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import QrWidget from '../../../../app/connections/QrWidget.vue';

describe('QrWidget', () => {
    it('renders the QR as an img with a data: URL, never the value as text', async () => {
        const value = '2@secret-pairing-material,abc';
        const html = await renderToString(createSSRApp(QrWidget, { value }));

        expect(html).toMatch(/<img[^>]+src="data:image\/svg\+xml,/);
        expect(html).toContain('data-testid="connection-qr"');
        expect(html).not.toContain('secret-pairing-material');
    });
});
