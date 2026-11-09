/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { envSecret } from '@chamvi/app';
import type { Env } from '@chamvi/app';
import { InvalidAgentDefinitionError, resolveConnection } from '@chamvi/core';
import type {
    ConnectionFieldSource,
    ConnectionTypeDefinition,
    ConnectionValue,
    ConnectionValues,
} from '@chamvi/core';
import { isSnowflake } from '../discord/policy.ts';
import type { DiscordPolicy } from '../discord/types.ts';
import { DISCORD_CONNECTION_TYPE } from './constants.ts';
import type { DiscordField, DiscordModuleOptions } from './types.ts';

/** The variable suffix of each field. */
const SUFFIXES = {
    token: 'TOKEN',
    applicationId: 'APPLICATION_ID',
    guilds: 'GUILDS',
    channels: 'CHANNELS',
    users: 'USERS',
    roles: 'ROLES',
    dmUsers: 'DM_USERS',
    requireMention: 'REQUIRE_MENTION',
} as const satisfies Record<DiscordField, string>;

/** The env variable of `key`: `CHAMVI_DISCORD_*`, a named instance `CHAMVI_DISCORD_<NAME>_*` (upper-cased, `-` as `_`). */
export function variableOf(name: string, key: DiscordField): string {
    return name === DISCORD_CONNECTION_TYPE ?
        `CHAMVI_DISCORD_${SUFFIXES[key]}` :
        `CHAMVI_DISCORD_${name.toUpperCase().replaceAll('-', '_')}_${SUFFIXES[key]}`;
}

/** What the factory took from code, which wins over everything; a given policy fixes all its fields. */
export function presetOf(
    options: Pick<DiscordModuleOptions, 'token' | 'applicationId' | 'policy'>,
): Record<string, { value: ConnectionValue; source: ConnectionFieldSource }> {
    const {
        token, 
        applicationId, 
        policy, 
    } = options;
    const entries: [string, ConnectionValue | undefined][] = [
        ['token', token],
        ['applicationId', applicationId],
    ];

    if (policy) {
        entries.push(
            ['guilds', policy.guilds],
            ['channels', policy.channels ?? []],
            ['users', policy.users ?? []],
            ['roles', policy.roles ?? []],
            ['dmUsers', policy.dms ? policy.dms.users : []],
            ['requireMention', policy.requireMention ?? true],
        );
    }

    const source: ConnectionFieldSource = { kind: 'code' };

    return Object.fromEntries(entries
        .filter((entry): entry is [string, ConnectionValue] => entry[1] !== undefined)
        .map(([key, value]) => [key, { value, source }]));
}

/**
 * Refuses a malformed variable at the factory, naming it and never its value:
 * booleans and lists through the field coercion, every list item a Discord
 * id. A missing variable is `setup`'s to decide; the token is not read here.
 */
export function assertEnvFormat(
    definition: ConnectionTypeDefinition,
    name: string,
    env: Env,
    preset: ReturnType<typeof presetOf>,
): void {
    const fields = definition.fields.filter((field) => field.kind !== 'secret');
    const { values, sources } = resolveConnection({
        definition: { ...definition, fields: fields.map((field) => ({ ...field, required: false })) },
        name,
        readVariable: (variable) => envSecret(env, variable),
        preset,
    });

    for (const field of fields) {
        const source = sources[field.key];

        if (field.kind !== 'list' || source?.kind !== 'env') {
            continue;
        }

        const malformed = (values[field.key] as string[]).some((id) => !isSnowflake(id));

        if (malformed) {
            throw new InvalidAgentDefinitionError(`${source.variable} must be a comma-separated list of Discord ids (snowflakes).`);
        }
    }
}

/** The channel policy of resolved values; an empty channel list means no narrowing, as an unset one. */
export function policyOf(values: ConnectionValues): DiscordPolicy {
    const list = (key: DiscordField) => (values[key] ?? []) as readonly string[];
    const dmUsers = list('dmUsers');
    const channels = list('channels');

    return {
        guilds: list('guilds'),
        ...(channels.length > 0 && { channels }),
        users: list('users'),
        roles: list('roles'),
        dms: dmUsers.length > 0 ? { users: dmUsers } : false,
        ...(values.requireMention !== undefined && { requireMention: values.requireMention as boolean }),
    };
}
