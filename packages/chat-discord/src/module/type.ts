/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { StoredConnection } from '@chamvi/app';
import type {
    ConnectionField,
    ConnectionTypeDefinition,
    DeclaredConnection,
    ResolvedConnection,
} from '@chamvi/core';
import { verifyDiscordToken } from '../discord/verify.ts';
import { DISCORD_CONNECTION_TYPE } from './constants.ts';
import { variableOf } from './helpers.ts';
import type { DiscordField } from './types.ts';

function fieldOf(key: DiscordField, field: Omit<ConnectionField, 'key' | 'env'>): ConnectionField {
    return {
        key,
        ...field,
        env: (connection) => variableOf(connection, key),
    };
}

/** The Discord connection type: one bot per module, its name the module's. */
export function discordConnectionDefinition(options: { apiUrl?: string; fetch?: typeof fetch } = {}): ConnectionTypeDefinition {
    return {
        type: DISCORD_CONNECTION_TYPE,
        label: 'Discord',
        multiple: false,
        fields: [
            fieldOf('token', {
                label: 'Bot token',
                kind: 'secret',
                required: true,
            }),
            fieldOf('applicationId', {
                label: 'Application ID',
                kind: 'string',
                required: true,
            }),
            fieldOf('guilds', {
                label: 'Guilds',
                kind: 'list',
                description: 'Guild ids whose messages may start runs; empty: no guild intake.',
            }),
            fieldOf('channels', {
                label: 'Channels',
                kind: 'list',
                description: 'Narrows guild intake to these channel ids; empty: every channel of the guilds.',
            }),
            fieldOf('users', {
                label: 'Users',
                kind: 'list',
                description: 'Author ids allowed in the guilds.',
            }),
            fieldOf('roles', {
                label: 'Roles',
                kind: 'list',
                description: 'Author role ids allowed in the guilds.',
            }),
            fieldOf('dmUsers', {
                label: 'DM users',
                kind: 'list',
                description: 'User ids whose direct messages may start runs; empty: no direct messages.',
            }),
            fieldOf('requireMention', {
                label: 'Require mention',
                kind: 'boolean',
                description: 'A guild message must mention the bot or reply to it. Default true.',
            }),
        ],
        // saved values only
        test: (values, signal) => verifyDiscordToken(values.token as string, { signal, ...options }),
    };
}

/** How an instance appears in the dashboard. */
export function declaredConnection(
    name: string,
    resolved: ResolvedConnection,
    editable: boolean,
    row: StoredConnection | undefined,
): DeclaredConnection {
    return {
        name,
        editable,
        deletable: false,
        resolved,
        ...(row && { loadedRevision: row.revision, loadedCreatedAt: row.createdAt }),
    };
}
