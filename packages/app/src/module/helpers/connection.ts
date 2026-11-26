/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError } from '@chamvi/errors';
import { DecryptionFailedError, InvalidAgentDefinitionError, resolveConnection } from '@chamvi/core';
import type { ConnectionValues, ResolveConnectionInput, ResolvedConnection } from '@chamvi/core';
import type { AgentIssue } from '@chamvi/http';
import type { IContainer } from 'eldin';
import { isKeyringUnsetError } from '../../keyring/helpers.ts';
import { AppToken } from '../constants.ts';
import type {
    ReadStoredConnectionsOptions,
    StoredConnection,
    StoredConnectionFailure,
} from '../types.ts';
import { isSchemaBehindError } from './schema.ts';

/** The `start --check` issues of the connections a module lists as incomplete or failed; field names and reasons only, never a value. */
export function connectionIssuesOf(container: IContainer): AgentIssue[] {
    const at = new Date(container.resolve(AppToken.CLOCK).now());

    return container.resolveAll(AppToken.CONNECTION_TYPES)
        .flatMap((provider) => provider.connections())
        .filter((connection) => connection.resolved.state === 'incomplete' || connection.resolved.state === 'failed')
        .map((connection) => {
            const {
                missing,
                reason,
                state,
            } = connection.resolved;
            const message = state === 'failed' ?
                `The connection "${connection.name}" cannot be used: ${reason ?? 'its stored values cannot be read.'}` :
                `The connection "${connection.name}" is incomplete${missing.length > 0 ? `: missing ${missing.join(', ')}` : ''}.`;

            return {
                agent: connection.name,
                message,
                at,
            };
        });
}

/**
 * Whether a row's read failed for a reason of the row, which degrades only
 * that connection: a seal that does not open (e.g. under a key dropped from
 * the keyring), or stored secrets while `ENCRYPTION_KEYS` is unset. A
 * malformed keyring is a deployment error and still fails the start.
 */
function isUnreadableConnectionError(error: unknown): error is ChamviError {
    if (error instanceof DecryptionFailedError) {
        return true;
    }

    return isKeyringUnsetError(error);
}

/**
 * One row's stored config; an unreadable row comes back with its settings
 * only and why its secrets cannot be read. Any other failure names the
 * connection, never a value.
 */
async function readStoredConnection(
    container: IContainer,
    name: string,
): Promise<Pick<StoredConnection, 'values' | 'revision' | 'id' | 'unreadable'> | undefined> {
    const configs = container.resolve(AppToken.CONNECTION_CONFIGS);
    // a value, or the failure of an unreadable row; any other failure throws
    const attempt = async (): Promise<Awaited<ReturnType<typeof configs.read>> | ChamviError> => {
        try {
            return await configs.read(name);
        } catch (error) {
            if (isSchemaBehindError(error)) {
                throw error;
            }

            if (!isUnreadableConnectionError(error)) {
                // our messages name variables, key ids and connections; a driver's may quote anything
                const reason = error instanceof ChamviError ? error.message : 'the read failed';

                throw new InvalidAgentDefinitionError(`The connection "${name}" cannot be read: ${reason}`);
            }

            return error;
        }
    };

    const first = await attempt();

    if (!(first instanceof ChamviError)) {
        return first && {
            values: first.values, 
            revision: first.revision, 
            id: first.generation, 
        };
    }

    // describe never resolves the keyring: the settings and the names of the secrets stay readable
    const view = await configs.describe(name);

    if (!view) {
        return undefined;
    }

    // read again after describe: a repair saved in between loads, and a row still unreadable reports a
    // revision no newer than the one that failed, so a later repair still shows as a pending restart
    const failure = await attempt();

    if (!(failure instanceof ChamviError)) {
        return failure && {
            values: failure.values, 
            revision: failure.revision, 
            id: failure.generation, 
        };
    }

    const unreadable: StoredConnectionFailure = {
        secrets: view.secretsSet,
        reason: `The stored secrets cannot be read (${failure.code}): ${failure.message}`,
    };

    container.resolve(AppToken.LOGGER).warn(`The connection "${name}": ${unreadable.reason} Unless env or code set each of them, it is listed as failed until it is repaired.`);

    return {
        // spread defines own properties: an assignment of `__proto__` would set the prototype instead
        values: { ...view.settings } as ConnectionValues,
        revision: view.revision,
        id: view.generation,
        unreadable,
    };
}

/**
 * The stored connections of `type` with their decrypted values, for a
 * module's `setup` (list `ModuleName.STORE` in `dependencies`). Nothing for a
 * store without connections. A row whose secrets cannot be read
 * (undecryptable, stored secrets without `ENCRYPTION_KEYS`) comes
 * back with its settings only and `unreadable` set, with a warning naming the
 * connection, never a value; resolve it with `resolveStoredConnection()`. Any
 * other read failure throws InvalidAgentDefinitionError naming the
 * connection. With `name`, only that row is read: rows of other names are
 * skipped before decryption. A check never migrates: one that finds the
 * store behind its migrations warns and returns nothing.
 */
export async function readStoredConnections(
    container: IContainer,
    type: string,
    options: ReadStoredConnectionsOptions = {},
): Promise<StoredConnection[]> {
    if (!container.has(AppToken.CONNECTION_SERVICE)) {
        return [];
    }

    const connections = container.resolve(AppToken.CONNECTION_SERVICE);

    const stored: StoredConnection[] = [];

    try {
        for (const row of await connections.find()) {
            const selected = row.type === type && (options.name === undefined || row.name === options.name);
            const config = selected ? await readStoredConnection(container, row.name) : undefined;

            if (config) {
                stored.push({
                    name: row.name,
                    values: config.values,
                    revision: config.revision,
                    // the row the config was read from: the listing's may be one deleted since
                    id: config.id,
                    ...(config.unreadable && { unreadable: config.unreadable }),
                });
            }
        }
    } catch (error) {
        if (!container.resolve(AppToken.CONTEXT).check || !isSchemaBehindError(error)) {
            throw error;
        }

        container.resolve(AppToken.LOGGER).warn(`The connection store is behind its migrations: the check sees the ${type} connections of the environment only.`);

        return [];
    }

    return stored;
}

/**
 * `resolveConnection()` over a stored row (`input.stored` is the row's
 * values). For a row whose secrets cannot be read, those secrets count as
 * stored, so a gap only they fill is no deployment error; when env or code
 * set every one of them the connection resolves as usual, else it is
 * `failed` with the row's reason, without those fields' values, and a module
 * uses it as one that is not configured.
 */
export function resolveStoredConnection(
    input: Omit<ResolveConnectionInput, 'stored'>,
    row: Pick<StoredConnection, 'values' | 'unreadable'> | undefined,
): ResolvedConnection {
    const unreadable = row?.unreadable;

    if (!unreadable) {
        return resolveConnection({ ...input, ...(row && { stored: row.values }) });
    }

    // fromEntries defines own properties: an assignment of `__proto__` would set the prototype instead
    const marked = Object.fromEntries(unreadable.secrets.map((key) => [key, '']));
    const resolved = resolveConnection({ ...input, stored: { ...row.values, ...marked } });
    const lost = unreadable.secrets.filter((key) => resolved.sources[key]?.kind === 'store');

    if (lost.length === 0) {
        return resolved;
    }

    return {
        ...resolved,
        values: Object.fromEntries(Object.entries(resolved.values).filter(([key]) => !lost.includes(key))),
        state: 'failed',
        reason: unreadable.reason,
    };
}
