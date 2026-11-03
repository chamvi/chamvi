/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import * as pkg from '@chamvi/chat-discord';

describe('public api', () => {
    it('exports exactly the Discord surface', () => {
        expect(Object.keys(pkg).sort()).toEqual([
            'DISCORD_ADAPTER_NAME',
            'DISCORD_API_URL',
            'DISCORD_AUTH_ERROR_CODE',
            'DISCORD_CONNECTION_ERROR_CODE',
            'DISCORD_RECONNECT',
            'DISCORD_SHUTDOWN_TIMEOUT_MS',
            'DISCORD_TEXT_MAX_CHARS',
            'createDiscordChat',
        ]);
        expect(pkg.DISCORD_ADAPTER_NAME).toBe('discord');
        expect(pkg.createDiscordChat).toBeTypeOf('function');
    });

    it.each([
        'createDiscordConnection',
        'createDiscordSender',
        'nonceOf',
        'resolvePolicy',
        'identityOf',
        'isAllowed',
        'toConversationTarget',
        'toApiMessage',
        'toChatMessage',
    ])('has no %s', (name) => {
        expect(pkg).not.toHaveProperty(name);
    });
});
