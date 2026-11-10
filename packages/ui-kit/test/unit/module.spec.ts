/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { createApp, defineComponent } from 'vue';
import kit, { APP_CONTEXT, install } from '@chamvi/ui-kit';
import type { AppContext } from '@chamvi/ui-kit';

const Root = defineComponent({ render: () => null });

describe('the Vue plugin', () => {
    it('is the default export', () => {
        expect(kit.install).toBe(install);
    });

    it('provides the context and registers no component by default', () => {
        const app = createApp(Root);
        const context = { config: { uiBase: '/ui' } } as unknown as AppContext;

        app.use(kit, { context });

        expect(app._context.provides[APP_CONTEXT as symbol]).toBe(context);
        expect(app.component('StatusBadge')).toBeUndefined();
    });

    it('registers every component, or the named ones', () => {
        const all = createApp(Root);

        all.use(kit, { components: true });
        expect(all.component('ConnectionPanel')).toBeDefined();
        expect(all.component('BrandLogo')).toBeDefined();

        const some = createApp(Root);

        some.use(kit, { components: ['StatusBadge'] });
        expect(some.component('StatusBadge')).toBeDefined();
        expect(some.component('NavIcon')).toBeUndefined();
    });
});
