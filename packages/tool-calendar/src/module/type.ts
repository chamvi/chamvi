/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { envSecret } from '@chamvi/app';
import type { Env, ILogger } from '@chamvi/app';
import {
    InvalidAgentDefinitionError,
    resolveConnection,
    storedConnectionName,
} from '@chamvi/core';
import type {
    ConnectionField,
    ConnectionFieldSource,
    ConnectionTypeDefinition,
    ConnectionValue,
    ConnectionValues,
    DeclaredConnection,
    IConnectionConfigStore,
    IConnectionRepository,
    ResolvedConnection,
} from '@chamvi/core';
import type { CalendarAccount } from '../client/types.ts';
import { normalizeAccounts } from '../options/module.ts';
import {
    CALENDAR_ACCOUNTS_VARIABLE,
    CALENDAR_CONNECTION_NAME_MAX_LENGTH,
    CALENDAR_CONNECTION_TYPE,
} from './constants.ts';
import { variableOf } from './helpers.ts';
import type { CalendarEnvEntry } from './types.ts';

type Preset = NonNullable<Parameters<typeof resolveConnection>[0]['preset']>;

type StoredAccount = { values: ConnectionValues; revision: number };

type LoadInput = {
    definition: ConnectionTypeDefinition;
    /** The accounts of the `accounts` option (`pinned`) or of `CHAMVI_CALENDAR_ACCOUNTS`. */
    declared: readonly CalendarEnvEntry[];
    pinned: boolean;
    env: Env;
    logger: ILogger;
    /** Absent when the store is not read: pinned accounts, a check, a store without connections. */
    connections?: IConnectionRepository;
    configs?: IConnectionConfigStore;
};

function accountIdOf(name: string): string | undefined {
    const prefix = `${CALENDAR_CONNECTION_TYPE}-`;

    return name.startsWith(prefix) ? name.slice(prefix.length) : undefined;
}

function credentialField(key: string, label: string, variable: string, extra: Partial<ConnectionField>): ConnectionField {
    return {
        key,
        label,
        kind: extra.kind ?? 'string',
        ...extra,
        env: (connection) => {
            const id = accountIdOf(connection);

            return id === undefined ? undefined : variableOf(id, variable);
        },
    };
}

/** The calendar connection type: one account per `calendar-<id>`, one URL once. */
export function calendarConnectionDefinition(): ConnectionTypeDefinition {
    return {
        type: CALENDAR_CONNECTION_TYPE,
        label: 'Calendar',
        multiple: true,
        fields: [
            {
                key: 'url',
                label: 'CalDAV URL',
                kind: 'string',
                required: true,
            },
            {
                key: 'address',
                label: 'Address',
                kind: 'string',
            },
            credentialField('user', 'User', 'USER', { description: 'Default the address.' }),
            credentialField('password', 'Password', 'PASSWORD', { kind: 'secret', required: true }),
        ],
        uniqueId: (values) => String(values.url ?? '').toLowerCase(),
    };
}

/** What the factory took from code or the JSON variable, which wins over everything. */
function presetOf(entry: CalendarEnvEntry, source: ConnectionFieldSource, pinned: boolean): Preset {
    const { account, address } = entry;
    const entries: [string, ConnectionValue | undefined][] = [
        ['url', account.url],
        ['address', address],
        // the variables of an env account resolve per field; code sets these too
        ...(pinned ? [['user', account.user], ['password', account.password]] as [string, string][] : []),
    ];

    return Object.fromEntries(entries
        .filter((item): item is [string, ConnectionValue] => item[1] !== undefined)
        .map(([key, value]) => [key, { value, source }]));
}

function toAccount(id: string, resolved: ResolvedConnection): CalendarAccount {
    const { values } = resolved;

    return {
        id,
        url: values.url as string,
        user: (values.user ?? values.address) as string,
        password: values.password as string,
    };
}

async function readStoredAccounts(input: LoadInput): Promise<Map<string, StoredAccount>> {
    const { connections, configs } = input;
    const stored = new Map<string, StoredAccount>();

    if (!connections || !configs) {
        return stored;
    }

    for (const row of await connections.find()) {
        const id = accountIdOf(row.name);
        const config = id !== undefined && row.type === CALENDAR_CONNECTION_TYPE ? await configs.read(row.name) : undefined;

        if (id !== undefined && config) {
            stored.set(id, config);
        }
    }

    return stored;
}

/**
 * The accounts the client reads and the connections the dashboard lists:
 * the declared ones (env winning per field over a stored row of the same
 * id), then the stored ones. A stored account that is incomplete or invalid
 * is listed for repair and not used; a declared one that does not hold fails
 * the start (InvalidAgentDefinitionError, never echoing a value).
 */
export async function loadCalendarAccounts(input: LoadInput): Promise<{ accounts: CalendarAccount[]; connections: DeclaredConnection[] }> {
    const {
        definition,
        declared,
        pinned,
        env,
        logger,
        configs,
    } = input;
    const stored = await readStoredAccounts(input);
    const accounts: CalendarAccount[] = [];
    const connections: DeclaredConnection[] = [];
    const readVariable = (variable: string) => envSecret(env, variable);
    const list = (id: string, resolved: ResolvedConnection, deletable: boolean, row: StoredAccount | undefined) => {
        const name = storedConnectionName(CALENDAR_CONNECTION_TYPE, id);

        if (name.length <= CALENDAR_CONNECTION_NAME_MAX_LENGTH) {
            connections.push({
                name,
                account: id,
                editable: !pinned && configs !== undefined,
                deletable,
                resolved,
                ...(row && { loadedRevision: row.revision }),
            });
        }
    };

    for (const entry of declared) {
        const { id } = entry.account;
        const row = stored.get(id);
        const source: ConnectionFieldSource = pinned ? { kind: 'code' } : { kind: 'env', variable: CALENDAR_ACCOUNTS_VARIABLE };
        const resolved = resolveConnection({
            definition,
            name: storedConnectionName(CALENDAR_CONNECTION_TYPE, id),
            readVariable,
            preset: presetOf(entry, source, pinned),
            ...(row && { stored: row.values }),
        });
        const merged = pinned ? entry.account : toAccount(id, resolved);

        normalizeAccounts([merged]);
        accounts.push(merged);
        list(id, resolved, false, row);
    }

    const declaredIds = new Set(declared.map((entry) => entry.account.id));

    for (const [id, row] of stored) {
        if (declaredIds.has(id)) {
            continue;
        }

        const resolved = resolveConnection({
            definition,
            name: storedConnectionName(CALENDAR_CONNECTION_TYPE, id),
            readVariable,
            stored: row.values,
        });

        if (resolved.state !== 'configured') {
            logger.warn(`Calendar account "${id}" is ${resolved.state.replace('_', ' ')} and is not used.`);
            list(id, resolved, true, row);

            continue;
        }

        const account = toAccount(id, resolved);

        try {
            normalizeAccounts([account]);
            accounts.push(account);
            list(id, resolved, true, row);
        } catch (error) {
            if (!(error instanceof InvalidAgentDefinitionError)) {
                throw error;
            }

            // the messages name the field, never a value
            logger.warn(`${error.message} The account is not used.`);
            list(id, { ...resolved, state: 'incomplete' }, true, row);
        }
    }

    return { accounts, connections };
}
