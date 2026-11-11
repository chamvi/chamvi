/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { envSecret } from '@chamvi/app';
import type { Env, ILogger, StoredConnection } from '@chamvi/app';
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
    ResolvedConnection,
} from '@chamvi/core';
import { verifyMailLogin } from '../client/login.ts';
import type { MailAccount } from '../client/types.ts';
import { normalizeAccount } from '../options/module.ts';
import {
    MAIL_ACCOUNTS_VARIABLE,
    MAIL_CONNECTION_NAME_MAX_LENGTH,
    MAIL_CONNECTION_TYPE,
} from './constants.ts';
import { variableOf } from './helpers.ts';
import type { MailEnvAccount } from './types.ts';

type Preset = NonNullable<Parameters<typeof resolveConnection>[0]['preset']>;

type LoadInput = {
    definition: ConnectionTypeDefinition;
    /** The accounts of the `accounts` option (`pinned`) or of `CHAMVI_MAIL_ACCOUNTS`. */
    declared: readonly MailEnvAccount[];
    pinned: boolean;
    env: Env;
    logger: ILogger;
    /** The stored rows of the type; none for pinned accounts. */
    rows: readonly StoredConnection[];
    /** Whether the store can take a save: no for pinned accounts or a store without connections. */
    editable: boolean;
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
                bindsSecrets: true,
            },
            {
                key: 'port',
                label: 'Port',
                kind: 'number',
                description: 'Default 993 with tls, else 143.',
                bindsSecrets: true,
            },
            {
                key: 'security',
                label: 'Security',
                kind: 'select',
                options: ['tls', 'starttls', 'plain'],
                description: 'Default tls.',
                bindsSecrets: true,
            },
            credentialField('user', 'User', 'USER', { description: 'Default the address.' }),
            credentialField('password', 'Password', 'PASSWORD', { kind: 'secret', required: true }),
        ],
        uniqueId: (values) => String(values.address ?? '').toLowerCase(),
        // saved values only; the account id is not part of a login
        test: (values, signal) => verifyMailLogin(normalizeAccount(toAccount('test', values), 'Mail account'), signal),
    };
}

/** What the factory took from code or the JSON variable, which wins over everything. */
function presetOf(account: MailEnvAccount, source: ConnectionFieldSource, pinned: boolean): Preset {
    const entries: [string, ConnectionValue | undefined][] = [
        ['address', pinned ? account.address ?? account.user : account.address],
        ['host', account.host],
        ['port', account.port],
        ['security', account.security],
        // the variables of an env account resolve per field; code sets these too
        ...(pinned ? [['user', account.user], ['password', account.password as string]] as [string, string][] : []),
    ];

    return Object.fromEntries(entries
        .filter((entry): entry is [string, ConnectionValue] => entry[1] !== undefined)
        .map(([key, value]) => [key, { value, source }]));
}

function toAccount(id: string, values: ConnectionValues, declared?: MailEnvAccount): MailAccount {
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

/**
 * The variables of a connection's fields that are set, also as `_FILE`, by
 * name: nothing is read, so a file that cannot be read stays untouched.
 */
function variablesSetFor(env: Env, definition: ConnectionTypeDefinition, connection: string): string[] {
    return definition.fields.flatMap((field) => {
        const variable = field.env?.(connection);

        return variable === undefined ? [] : [variable, `${variable}_FILE`].filter((name) => (env[name] ?? '').length > 0);
    });
}

/** Only the stored secrets: what stays of a row whose settings the client refuses. */
function storedSecretsOf(definition: ConnectionTypeDefinition, values: ConnectionValues): ConnectionValues {
    return Object.fromEntries(Object.entries(values).filter(([key]) => definition.fields.some((field) => field.key === key && field.kind === 'secret')));
}

/**
 * The accounts the client reads and the connections the dashboard lists:
 * the declared ones (env winning per field over a stored row of the same
 * id), then the stored ones, which take every value from the store: a
 * variable named after such an account is ignored with a warning, since
 * whoever added the row chose where its secrets go (#197). A stored account
 * that is incomplete or invalid is listed for repair and not used; a declared one drops a stored setting
 * the client refuses, is listed incomplete and stays in use, and fails the
 * start only for what env and store both lack (never echoing a value).
 */
export async function loadMailAccounts(input: LoadInput): Promise<{ accounts: MailAccount[]; connections: DeclaredConnection[] }> {
    const {
        definition,
        declared,
        pinned,
        env,
        logger,
        rows,
        editable,
    } = input;
    const stored = new Map(rows.flatMap((row) => {
        const id = accountIdOf(row.name);

        return id === undefined ? [] : [[id, row] as const];
    }));
    const accounts: MailAccount[] = [];
    const connections: DeclaredConnection[] = [];
    const readVariable = (variable: string) => envSecret(env, variable);
    const list = (id: string, resolved: ResolvedConnection, deletable: boolean, row: StoredConnection | undefined) => {
        const name = storedConnectionName(MAIL_CONNECTION_TYPE, id);

        if (name.length <= MAIL_CONNECTION_NAME_MAX_LENGTH) {
            connections.push({
                name,
                account: id,
                editable,
                deletable,
                resolved,
                ...(row && { loadedRevision: row.revision, loadedCreatedAt: row.createdAt }),
            });
        }
    };

    for (const account of declared) {
        const row = stored.get(account.id);
        const source: ConnectionFieldSource = pinned ? { kind: 'code' } : { kind: 'env', variable: MAIL_ACCOUNTS_VARIABLE };
        const resolve = (values: ConnectionValues | undefined) => resolveConnection({
            definition,
            name: storedConnectionName(MAIL_CONNECTION_TYPE, account.id),
            readVariable,
            preset: presetOf(account, source, pinned),
            ...(values && { stored: values }),
        });
        const label = `Mail account "${account.id}"`;
        let resolved = resolve(row?.values);
        let merged = pinned ? account as MailAccount : toAccount(account.id, resolved.values, account);

        try {
            normalizeAccount(merged, label);
        } catch (error) {
            if (!row || !(error instanceof InvalidAgentDefinitionError)) {
                throw error;
            }

            // a stored setting the client refuses must not stop the app whose dashboard repairs it
            logger.warn(`${error.message} The stored settings are dropped.`);
            resolved = {
                ...resolve(storedSecretsOf(definition, row.values)), 
                state: 'incomplete', 
                reason: error.message, 
            };
            merged = toAccount(account.id, resolved.values, account);
            normalizeAccount(merged, label);
        }

        accounts.push(merged);
        list(account.id, resolved, false, row);
    }

    const declaredIds = new Set(declared.map((account) => account.id));

    for (const [id, row] of stored) {
        if (declaredIds.has(id)) {
            continue;
        }

        const name = storedConnectionName(MAIL_CONNECTION_TYPE, id);

        for (const variable of variablesSetFor(env, definition, name)) {
            // the name only: the variable may hold the secret of an account that left the list
            logger.warn(`The variable ${variable} is ignored: the mail account "${id}" is not listed in ${MAIL_ACCOUNTS_VARIABLE} and takes its values from the store.`);
        }

        const resolved = resolveConnection({
            definition,
            name,
            readVariable: () => undefined,
            stored: row.values,
        });

        if (resolved.state !== 'configured') {
            logger.warn(`Mail account "${id}" is ${resolved.state.replace('_', ' ')} and is not used.`);
            list(id, resolved, true, row);

            continue;
        }

        const account = toAccount(id, resolved.values);

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
            list(id, {
                ...resolved, 
                state: 'incomplete', 
                reason: error.message, 
            }, true, row);
        }
    }

    return { accounts, connections };
}
