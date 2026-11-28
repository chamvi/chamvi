/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { envSecret, resolveStoredConnection } from '@chamvi/app';
import type { Env, StoredConnection } from '@chamvi/app';
import {
    InvalidAgentDefinitionError,
    storedConnectionName,
} from '@chamvi/core';
import type {
    ConnectionField,
    ConnectionTypeDefinition,
    ConnectionValue,
    ConnectionValues,
    DeclaredConnection,
    ILogger,
    ResolveConnectionInput,
    ResolvedConnection,
} from '@chamvi/core';
import type { ConnectionFieldSource } from '@chamvi/core-kit';
import { verifyMailLogin } from '../client/login.ts';
import type { MailAccount } from '../client/types.ts';
import { normalizeAccount } from '../options/module.ts';
import { normalizeSmtp } from '../write-client/asserts.ts';
import { verifySmtpLogin } from '../write-client/smtp.ts';
import type { MailSmtpSettings, MailWriteAccount } from '../write-client/types.ts';
import {
    MAIL_ACCOUNTS_VARIABLE,
    MAIL_CONNECTION_NAME_MAX_LENGTH,
    MAIL_CONNECTION_TYPE,
} from './constants.ts';
import { variableOf } from './helpers.ts';
import type { MailEnvAccount } from './types.ts';

type Preset = NonNullable<ResolveConnectionInput['preset']>;

type LoadInput = {
    definition: ConnectionTypeDefinition;
    /** The accounts of the `accounts` option (`pinned`) or of `MAIL_ACCOUNTS`. */
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
            {
                key: 'smtpHost',
                label: 'SMTP host',
                kind: 'string',
                description: 'Set to send mail; the user and password log in to SMTP too.',
                bindsSecrets: true,
            },
            {
                key: 'smtpPort',
                label: 'SMTP port',
                kind: 'number',
                description: 'Default 465 with tls, 587 with starttls, else 25.',
                bindsSecrets: true,
            },
            {
                key: 'smtpSecurity',
                label: 'SMTP security',
                kind: 'select',
                options: ['tls', 'starttls', 'plain'],
                description: 'Default tls.',
                bindsSecrets: true,
            },
        ],
        uniqueId: (values) => String(values.address ?? '').toLowerCase(),
        // saved values only; the account id is not part of a login. SMTP after IMAP, when the account sends
        test: async (values, signal) => {
            const account = toAccount('test', values);
            const normalized = normalizeAccount(account, 'Mail account');

            await verifyMailLogin(normalized, signal);

            if (account.smtp !== undefined) {
                await verifySmtpLogin({ ...normalized, smtp: normalizeSmtp(account.smtp, 'Mail account.smtp') }, signal);
            }
        },
    };
}

/** What the factory took from code or the JSON variable, which wins over everything. */
function presetOf(account: MailEnvAccount, source: ConnectionFieldSource, pinned: boolean): Preset {
    const entries: [string, ConnectionValue | undefined][] = [
        ['address', pinned ? account.address ?? account.user : account.address],
        ['host', account.host],
        ['port', account.port],
        ['security', account.security],
        ['smtpHost', account.smtp?.host],
        ['smtpPort', account.smtp?.port],
        ['smtpSecurity', account.smtp?.security],
        // the variables of an env account resolve per field; code sets these too
        ...(pinned ? [['user', account.user], ['password', account.password as string]] as [string, string][] : []),
    ];

    return Object.fromEntries(entries
        .filter((entry): entry is [string, ConnectionValue] => entry[1] !== undefined)
        .map(([key, value]) => [key, { value, source }]));
}

/** The SMTP settings of the flat `smtp*` values; any of them set gives an object `normalizeSmtp` checks. */
function smtpOf(values: ConnectionValues): MailSmtpSettings | undefined {
    if (values.smtpHost === undefined && values.smtpPort === undefined && values.smtpSecurity === undefined) {
        return undefined;
    }

    return {
        host: values.smtpHost as string,
        ...(values.smtpPort !== undefined && { port: values.smtpPort as number }),
        ...(values.smtpSecurity !== undefined && { security: values.smtpSecurity as MailSmtpSettings['security'] }),
    };
}

/** An account checked for reading and, with `smtp`, for sending (InvalidAgentDefinitionError naming the field). */
function assertWriteAccount(account: MailWriteAccount, label: string): void {
    normalizeAccount(account, label);

    if (account.smtp !== undefined) {
        normalizeSmtp(account.smtp, `${label}.smtp`);
    }
}

/** The message of the error `account.smtp` is refused with (naming the field, never a value); undefined when fine or absent. */
function refusedSmtpOf(account: MailWriteAccount, label: string): string | undefined {
    if (account.smtp === undefined) {
        return undefined;
    }

    try {
        normalizeSmtp(account.smtp, `${label}.smtp`);

        return undefined;
    } catch (error) {
        if (!(error instanceof InvalidAgentDefinitionError)) {
            throw error;
        }

        return error.message;
    }
}

function toAccount(id: string, values: ConnectionValues, declared?: MailEnvAccount): MailWriteAccount {
    const address = values.address as string | undefined;
    const smtp = smtpOf(values);

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
        ...(smtp !== undefined && { smtp }),
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

/** The stored values without the smtp settings: what stays of a row whose smtp settings the client refuses. */
function storedWithoutSmtpOf(values: ConnectionValues): ConnectionValues {
    return Object.fromEntries(Object.entries(values).filter(([key]) => !key.startsWith('smtp')));
}

/** Whether `account` passes assertWriteAccount() (any other error rethrown). */
function isWriteAccount(account: MailWriteAccount, label: string): boolean {
    try {
        assertWriteAccount(account, label);

        return true;
    } catch (error) {
        if (!(error instanceof InvalidAgentDefinitionError)) {
            throw error;
        }

        return false;
    }
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
 * that is incomplete or invalid is listed for repair and not used, and so is
 * an account whose stored password cannot be read (`failed`, unless env sets
 * it); a declared one drops a stored setting
 * the client refuses, is listed incomplete and stays in use, and fails the
 * start only for what env and store both lack (never echoing a value).
 */
export async function loadMailAccounts(input: LoadInput): Promise<{ accounts: MailWriteAccount[]; connections: DeclaredConnection[] }> {
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
    const accounts: MailWriteAccount[] = [];
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
                ...(row && { loadedRevision: row.revision, loadedGeneration: row.id }),
            });
        }
    };

    for (const account of declared) {
        const row = stored.get(account.id);
        const source: ConnectionFieldSource = pinned ? { kind: 'code' } : { kind: 'env', variable: MAIL_ACCOUNTS_VARIABLE };
        const resolve = (stored: Pick<StoredConnection, 'values' | 'unreadable'> | undefined) => resolveStoredConnection({
            definition,
            name: storedConnectionName(MAIL_CONNECTION_TYPE, account.id),
            readVariable,
            preset: presetOf(account, source, pinned),
        }, stored);
        const label = `Mail account "${account.id}"`;
        let resolved = resolve(row);

        if (resolved.state === 'failed') {
            // its stored password did not open: listed for repair, not used
            list(account.id, resolved, false, row);

            continue;
        }

        let merged = pinned ? account as MailWriteAccount : toAccount(account.id, resolved.values, account);

        try {
            assertWriteAccount(merged, label);
        } catch (error) {
            if (!row || !(error instanceof InvalidAgentDefinitionError)) {
                throw error;
            }

            // a stored setting the client refuses must not stop the app whose dashboard repairs it: a refused
            // smtp value drops the stored smtp settings only, anything else every stored setting
            const withoutSmtp = { values: storedWithoutSmtpOf(row.values) };
            const fallback = refusedSmtpOf(toAccount(account.id, resolved.values, account), label) !== undefined &&
                isWriteAccount(toAccount(account.id, resolve(withoutSmtp).values, account), label) ?
                withoutSmtp :
                { values: storedSecretsOf(definition, row.values) };

            logger.warn(`${error.message} ${fallback === withoutSmtp ? 'The stored SMTP settings are dropped.' : 'The stored settings are dropped.'}`);
            resolved = {
                ...resolve(fallback),
                state: 'incomplete',
                reason: error.message,
            };
            merged = toAccount(account.id, resolved.values, account);
            assertWriteAccount(merged, label);
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

        const resolved = resolveStoredConnection({
            definition,
            name,
            readVariable: () => undefined,
        }, row);

        if (resolved.state !== 'configured') {
            logger.warn(`Mail account "${id}" is ${resolved.state.replace('_', ' ')} and is not used.`);
            list(id, resolved, true, row);

            continue;
        }

        const label = `Mail account "${id}"`;
        const account = toAccount(id, resolved.values);

        try {
            normalizeAccount(account, label);

            const refused = refusedSmtpOf(account, label);

            if (refused !== undefined) {
                // the account still reads; the dashboard repairs its sending
                logger.warn(`${refused} The SMTP settings are dropped; the account reads only.`);
                delete account.smtp;
            }

            accounts.push(account);
            list(id, refused === undefined ? resolved : {
                ...resolved,
                state: 'incomplete',
                reason: refused,
            }, true, row);
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
