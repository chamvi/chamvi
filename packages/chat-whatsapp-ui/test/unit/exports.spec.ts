/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import * as module from '@chamvi/chat-whatsapp-ui/module';

describe('public api', () => {
    it('exports the module', () => {
        expect(Object.keys(module).sort()).toEqual([
            'CHAT_WHATSAPP_UI_MODULE_NAME',
            'CHAT_WHATSAPP_UI_SLUG',
            'chatWhatsappUiModule',
        ]);
    });
});
