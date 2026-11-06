/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import * as pkg from '@chamvi/chat-whatsapp';
import * as module from '@chamvi/chat-whatsapp/module';

describe('public api', () => {
    it('exports exactly the WhatsApp surface', () => {
        expect(Object.keys(pkg).sort()).toEqual([
            'WHATSAPP_ADAPTER_NAME',
            'WHATSAPP_AUTH_ERROR_CODE',
            'WHATSAPP_CONNECTION_ERROR_CODE',
            'WHATSAPP_CONNECTION_TYPE',
            'WHATSAPP_LOGGED_OUT_ERROR_CODE',
            'WHATSAPP_RECONNECT',
            'WHATSAPP_SHUTDOWN_TIMEOUT_MS',
            'createStoreWhatsAppAuth',
            'createWhatsAppChat',
        ]);
        expect(pkg.WHATSAPP_CONNECTION_TYPE).toBe('whatsapp');
        expect(pkg.WHATSAPP_ADAPTER_NAME).toBe('whatsapp');
        expect(pkg.createWhatsAppChat).toBeTypeOf('function');
    });

    it.each([
        'createWhatsAppAdapter',
        'createWhatsAppConnection',
        'resolvePolicy',
        'isAllowed',
        'toConversationTarget',
        'MESSAGE_ID_PREFIX',
        'whatsappModule',
        'WhatsAppModule',
    ])('has no %s', (name) => {
        expect(pkg).not.toHaveProperty(name);
    });

    it('exports the app module from /module only', () => {
        expect(Object.keys(module).sort()).toEqual(['WhatsAppModule', 'whatsappModule']);
    });
});
