/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import installButton from '@vuecs/button';
import vuecs from '@vuecs/core';
import installCountdown from '@vuecs/countdown';
import installElements from '@vuecs/elements';
import installForms from '@vuecs/forms';
import installIcon from '@vuecs/icon';
import lucide from '@vuecs/icons-lucide';
import installOverlays from '@vuecs/overlays';
import installPagination from '@vuecs/pagination';
import installPlaceholder from '@vuecs/placeholder';
import installTable from '@vuecs/table';
import tailwind from '@vuecs/theme-tailwind';
import installTimeago from '@vuecs/timeago';
import type { App } from 'vue';
import { FORM_THEME } from './constants.ts';
import { installValidation } from './validation.ts';

/**
 * vuecs with the kit's themes, its component packages and the form
 * validation messages: what `mountPage` installs before a page mounts, for an
 * app or a test that mounts a page itself. The vuecs theme manager is
 * first-install-wins, so call it before any other vuecs install.
 */
export function installVuecs(app: App): void {
    app.use(vuecs, { themes: [tailwind(), FORM_THEME], icons: [lucide()] });

    for (const plugin of [
        installIcon,
        installButton,
        installCountdown,
        installElements,
        installForms,
        installOverlays,
        installPagination,
        installPlaceholder,
        installTable,
        installTimeago,
    ]) {
        app.use(plugin);
    }

    installValidation(app);
}
