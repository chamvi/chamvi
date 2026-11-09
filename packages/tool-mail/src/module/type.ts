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
import type { MailAccount } from '../client/types.ts';
import { normalizeAccount } from '../options/module.ts';
import {
    MAIL_ACCOUNTS_VARIABLE,
    MAIL_CONNECTION_NAME_MAX_LENGTH,
    MAIL_CONNECTION_TYPE,
} from './constants.ts';
import { variableOf } from './helpers.ts';

type Preset = NonNullable<Parameters<typeof resolveConnection>[0]['preset']>;

type StoredAccount = { values: ConnectionValues; revision: number };

type LoadInput = {
    definition: ConnectionTypeDefinition;
    /** The accounts of the `accounts` option (`pinned`) or of `CHAMVI_MAIL_ACCOUNTS`. */
    declared: readonly MailAccount[];
    pinned: boolean;
    env: Env;
    logger: ILogger;
    /** Absent when the store is not read: pinned accounts, a check, a store without connections. */
    connections?: IConnectionRepository;
    configs?: IConnectionConfigStore;
};

function accountIdOf(name: string): string | undefined {
    const prefix = `${MAIL_CONNECTION_TYPE}-`;

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

/** The mail connection type: one account per `mail-<id>`, one address once. */
export function mailConnectionDefinition(): ConnectionTypeDefinition {
    return {
        type: MAIL_CONNECTION_TYPE,
        label: 'Mail',
        multiple: true,
        fields: [
            {
                key: 'address',
                label: 'Address',
                kind: 'string',
                required: true,
            },
            {
                key: 'host',
                label: 'IMAP host',
                kind: 'string',
                required: true,
            },
            {
                key: 'port',
                label: 'Port',
                kind: 'number',
                description: 'Default 993 with tls, else 143.',
            },
            {
                key: 'security',
                label: 'Security',
                kind: 'select',
                options: ['tls', 'starttls', 'plain'],
                description: 'Default tls.',
            },
            credentialField('user', 'User', 'USER', { description: 'Default the address.' }),
            credentialField('password', 'Password', 'PASSWORD', { kind: 'secret', required: true }),
        ],
        uniqueId: (values) => String(values.address ?? '').toLowerCase(),
    };
}

/** What the factory took from code or the JSON variable, which wins over everything. */
function presetOf(account: MailAccount, source: ConnectionFieldSource, pinned: boolean): Preset {
    const entries: [string, ConnectionValue | undefined][] = [
        ['address', pinned ? account.address ?? account.user : account.address],
        ['host', account.host],
        ['port', account.port],
        ['security', account.security],
        // the variables of an env account resolve per field; code sets these too
        ...(pinned ? [['user', account.user], ['password', account.password]] as [string, string][] : []),
    ];

    return Object.fromEntries(entries
        .filter((entry): entry is [string, ConnectionValue] => entry[1] !== undefined)
        .map(([key, value]) => [key, { value, source }]));
}

function toAccount(id: string, resolved: ResolvedConnection, declared?: MailAccount): MailAccount {
    const { values } = resolved;
    const address = values.address as string | undefined;

    return {
        id,
        host: values.host as string,
        user: (values.user ?? address) as string,
        password: values.password as string,
        ...(address !== undefined && { address }),
        ...(values.port !== undefined && { port: values.port as number }),
        ...(values.security !== undefined && { security: values.security as MailAccount['security'] }),
        ...(declared?.folders !== undefined && { folders: declared.folders }),
        ...(declared?.gmail !== undefined && { gmail: declared.gmail }),
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
        const config = id !== undefined && row.type === MAIL_CONNECTION_TYPE ? await configs.read(row.name) : undefined;

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
export async function loadMailAccounts(input: LoadInput): Promise<{ accounts: MailAccount[]; connections: DeclaredConnection[] }> {
    const {
        definition,
        declared,
        pinned,
        env,
        logger,
        configs,
    } = input;
    const stored = await readStoredAccounts(input);
    const accounts: MailAccount[] = [];
    const connections: DeclaredConnection[] = [];
    const readVariable = (variable: string) => envSecret(env, variable);
    const list = (id: string, resolved: ResolvedConnection, deletable: boolean, row: StoredAccount | undefined) => {
        const name = storedConnectionName(MAIL_CONNECTION_TYPE, id);

        if (name.length <= MAIL_CONNECTION_NAME_MAX_LENGTH) {
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

    for (const account of declared) {
        const row = stored.get(account.id);
        const source: ConnectionFieldSource = pinned ? { kind: 'code' } : { kind: 'env', variable: MAIL_ACCOUNTS_VARIABLE };
        const resolved = resolveConnection({
            definition,
            name: storedConnectionName(MAIL_CONNECTION_TYPE, account.id),
            readVariable,
            preset: presetOf(account, source, pinned),
            ...(row && { stored: row.values }),
        });
        const merged = pinned ? account : toAccount(account.id, resolved, account);

        normalizeAccount(merged, `Mail account "${account.id}"`);
        accounts.push(merged);
        list(account.id, resolved, false, row);
    }

    const declaredIds = new Set(declared.map((account) => account.id));

    for (const [id, row] of stored) {
        if (declaredIds.has(id)) {
            continue;
        }

        const resolved = resolveConnection({
            definition,
            name: storedConnectionName(MAIL_CONNECTION_TYPE, id),
            readVariable,
            stored: row.values,
        });

        if (resolved.state !== 'configured') {
            logger.warn(`Mail account "${id}" is ${resolved.state.replace('_', ' ')} and is not used.`);
            list(id, resolved, true, row);

            continue;
        }

        const account = toAccount(id, resolved);

        try {
            normalizeAccount(account, `Mail account "${id}"`);
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
