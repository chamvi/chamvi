/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { App, Component } from 'vue';
import ConnectionPanel from './connections/ConnectionPanel.vue';
import StatusBadge from './connections/StatusBadge.vue';
import { APP_CONTEXT } from './context/constants.ts';
import BrandLogo from './shell/BrandLogo.vue';
import NavIcon from './shell/NavIcon.vue';
import StatusChip from './shell/StatusChip.vue';
import type { UiKitOptions } from './types.ts';

const COMPONENTS: Record<string, Component> = {
    BrandLogo,
    ConnectionPanel,
    NavIcon,
    StatusBadge,
    StatusChip,
};

export function installComponents(app: App, input?: boolean | string[]): void {
    if (input === undefined || input === false) {
        return;
    }

    for (const [name, component] of Object.entries(COMPONENTS)) {
        if (input === true || input.includes(name)) {
            app.component(name, component);
        }
    }
}

/**
 * The kit's Vue plugin. It installs no vuecs package: their theme manager
 * is first-install-wins, so the app (or `mountPage`) installs vuecs itself,
 * with its themes, first.
 */
export function install(app: App, options: UiKitOptions = {}): void {
    if (options.context) {
        app.provide(APP_CONTEXT, options.context);
    }

    installComponents(app, options.components);
}
