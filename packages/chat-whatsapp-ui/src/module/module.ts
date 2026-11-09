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
import { CHAT_WHATSAPP_UI_MODULE_NAME, CHAT_WHATSAPP_UI_SLUG } from './constants.ts';
import type { ChatWhatsappUiModuleOptions } from './types.ts';

/** The page's build: next to the bundled module, or the package's `dist/app` when running from source. */
function pageRoot(): string {
    const candidates = [
        fileURLToPath(new URL('./app/', import.meta.url)),
        fileURLToPath(new URL('../../dist/app/', import.meta.url)),
    ];

    return candidates.find((candidate) => existsSync(join(candidate, 'index.html'))) ?? candidates[0]!;
}

/** Serves the WhatsApp page and registers it in the sidebar; needs `whatsappModule()` too. */
export function chatWhatsappUiModule(options: ChatWhatsappUiModuleOptions = {}): IModule {
    return uiPageModule({
        name: CHAT_WHATSAPP_UI_MODULE_NAME,
        label: 'WhatsApp',
        types: ['whatsapp'],
        slug: CHAT_WHATSAPP_UI_SLUG,
        root: pageRoot(),
        ...(options.uiBase === undefined ? {} : { uiBase: options.uiBase }),
    });
}
