/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { uiPageModule } from '@chamvi/app';
import type { IModule } from '@chamvi/app';
import { CHAT_DISCORD_UI_MODULE_NAME, CHAT_DISCORD_UI_SLUG } from './constants.ts';
import type { ChatDiscordUiModuleOptions } from './types.ts';

/** The page's build: next to the bundled module, or the package's `dist/app` when running from source. */
function pageRoot(): string {
    const candidates = [
        fileURLToPath(new URL('./app/', import.meta.url)),
        fileURLToPath(new URL('../../dist/app/', import.meta.url)),
    ];

    return candidates.find((candidate) => existsSync(join(candidate, 'index.html'))) ?? candidates[0]!;
}

/** Serves the Discord page and registers it in the sidebar; needs the connection type's own module too. */
export function chatDiscordUiModule(options: ChatDiscordUiModuleOptions = {}): IModule {
    return uiPageModule({
        name: CHAT_DISCORD_UI_MODULE_NAME,
        label: 'Discord',
        types: ['discord'],
        slug: CHAT_DISCORD_UI_SLUG,
        root: pageRoot(),
        ...(options.uiBase === undefined ? {} : { uiBase: options.uiBase }),
    });
}
