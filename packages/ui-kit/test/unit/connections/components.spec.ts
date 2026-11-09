/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import StatusBadge from '../../../src/connections/StatusBadge.vue';

describe('StatusBadge', () => {
    it('renders the label in the tone of the status', async () => {
        const html = await renderToString(createSSRApp(StatusBadge, { status: 'held_elsewhere' }));

        expect(html).toContain('chip-waiting');
        expect(html).toContain('held elsewhere');
        expect(html).toContain('data-testid="connection-status"');
    });
});
