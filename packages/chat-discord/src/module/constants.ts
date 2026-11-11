/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DiscordField } from './types.ts';

/** The prefix of a Discord module's id: `chamvi:discord:<name>`. */
export const DISCORD_MODULE_NAME = 'chamvi:discord';

/** The connection type of Discord bots (single instance: a second bot is a second module). */
export const DISCORD_CONNECTION_TYPE = 'discord';

/** The connection field each option a `createDiscordChat` refusal starts with stands for. */
export const DISCORD_OPTION_FIELDS: Readonly<Record<string, DiscordField>> = {
    token: 'token',
    applicationId: 'applicationId',
    'policy.guilds': 'guilds',
    'policy.channels': 'channels',
    'policy.users': 'users',
    'policy.roles': 'roles',
    'policy.dms.users': 'dmUsers',
    'policy.requireMention': 'requireMention',
};
