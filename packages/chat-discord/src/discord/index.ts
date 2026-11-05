/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export {
    DISCORD_ADAPTER_NAME,
    DISCORD_API_URL,
    DISCORD_AUTH_ERROR_CODE,
    DISCORD_CONNECTION_ERROR_CODE,
    DISCORD_RECONNECT,
    DISCORD_SHUTDOWN_TIMEOUT_MS,
    DISCORD_TEXT_MAX_CHARS,
} from './constants.ts';
export { createDiscordChat } from './module.ts';
export type {
    DiscordChatOptions,
    DiscordChatSetup,
    DiscordClient,
    DiscordClientFactory,
    DiscordConnectionStatus,
    DiscordConversationInput,
    DiscordIdentity,
    DiscordInboundAttachment,
    DiscordInboundMessage,
    DiscordPolicy,
} from './types.ts';
