/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Env } from '@chamvi/app';
import type { DeclaredConnection } from '@chamvi/core';
import type { DiscordChatOptions, DiscordPolicy } from '../discord/types.ts';

export type DiscordModuleOptions = Omit<DiscordChatOptions, 'account' | 'token' | 'applicationId' | 'policy' | 'approvalUrl'> & {
    /**
     * The instance's name (agent-name rule), default `discord`: its stored
     * connection, the channel name, the account and the env prefix
     * (`CHAMVI_DISCORD_<NAME>_*`; the default instance `CHAMVI_DISCORD_*`).
     */
    name?: string;
    /** Default `process.env`; format errors throw at the factory, a missing value in `setup`. */
    env?: Env;
    /** The bot token; wins over env and the store. */
    token?: string;
    /** The bot's application id; wins over env and the store. */
    applicationId?: string;
    /** Who may start runs; given here it is fixed as a whole, env and the store add nothing. */
    policy?: DiscordPolicy;
    /** The approval link; default the dashboard's approvals page under `CHAMVI_PUBLIC_URL`. */
    approvalUrl?: DiscordChatOptions['approvalUrl'];
};

/** The connection fields, one variable and form field each. */
export type DiscordField = 'token' | 'applicationId' | 'guilds' | 'channels' | 'users' | 'roles' | 'dmUsers' | 'requireMention';

/** The Discord modules of one app, sharing one connection type provider. */
export type DiscordInstances = {
    connections: DeclaredConnection[];
};
