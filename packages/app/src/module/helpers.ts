/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError, InvalidAgentDefinitionError } from '@chamvi/core';
import type { AgentIssue } from '@chamvi/http';
import type { IContainer } from 'eldin';
import type { IModule } from 'orkos';
import { isObject } from 'smob';
import { APP_ERROR_CODE, AppToken, SCHEMA_BEHIND_SQLSTATES } from './constants.ts';
import type {
    AppContext,
    ILifecycleHook,
    LifecyclePhase,
    ReadStoredConnectionsOptions,
    StoredConnection,
} from './types.ts';

/** The reason the context signal aborts with once stop() is called (internal). */
export function createStoppedError(): ChamviError {
    return new ChamviError({
        code: APP_ERROR_CODE.STOPPED,
        message: 'The app was stopped.',
    });
}

/** Throws the context signal's reason (the app_stopped ChamviError) once stop() was called. */
export function throwIfStopped(context: AppContext): void {
    if (context.signal.aborted) {
        throw context.signal.reason;
    }
}

/**
 * Runs the given phase of every `AppToken.LIFECYCLE_HOOKS` entry in
 * registration order. A throwing hook is reported (`{ hook, phase }`) and the
 * others still run; it never rejects.
 */
export async function runHooks(container: IContainer, phase: 'engineCreated', ...args: Parameters<NonNullable<ILifecycleHook['engineCreated']>>): Promise<void>;
export async function runHooks(container: IContainer, phase: Exclude<LifecyclePhase, 'engineCreated'>): Promise<void>;
export async function runHooks(container: IContainer, phase: LifecyclePhase, ...args: unknown[]): Promise<void> {
    const context = container.resolve(AppToken.CONTEXT);
    const hooks = container.resolveAll(AppToken.LIFECYCLE_HOOKS);

    for (const hook of hooks) {
        const fn = hook[phase] as ((...input: unknown[]) => void | Promise<void>) | undefined;

        if (!fn) {
            continue;
        }

        try {
            await fn.apply(hook, args);
        } catch (error) {
            context.report(error, { hook: hook.name, phase });
        }
    }
}

/**
 * Wraps a module so a throwing `teardown` is reported (`{ module: name }`)
 * instead of being swallowed by orkos; everything else is delegated (internal).
 */
export function reportingModule(module: IModule, report: AppContext['report']): IModule {
    const {
        teardown,
        onReady,
        onError,
    } = module;

    return {
        name: module.name,
        version: module.version,
        dependencies: module.dependencies,
        setup: (container) => module.setup(container),
        ...(onReady && { onReady: (container: IContainer) => onReady.call(module, container) }),
        ...(onError && { onError: (error: Error, container: IContainer) => onError.call(module, error, container) }),
        ...(teardown && {
            async teardown(container: IContainer) {
                try {
                    await teardown.call(module, container);
                } catch (error) {
                    report(error, { module: module.name });
                }
            },
        }),
    };
}

/**
 * Whether `error` is the database's "no such table or column": a store behind
 * its migrations, which a check meets because it never migrates.
 */
export function isSchemaBehindError(error: unknown): boolean {
    if (!isObject(error)) {
        return false;
    }

    // TypeORM's QueryFailedError carries the driver's error, with its SQLSTATE
    const code = isObject(error.driverError) ? error.driverError.code : error.code;

    return typeof code === 'string' && SCHEMA_BEHIND_SQLSTATES.includes(code);
}

/** The `start --check` issues of the connections a module lists as incomplete; field names only, never a value. */
export function connectionIssuesOf(container: IContainer): AgentIssue[] {
    const at = container.resolve(AppToken.CLOCK).now();

    return container.resolveAll(AppToken.CONNECTION_TYPES)
        .flatMap((provider) => provider.connections())
        .filter((connection) => connection.resolved.state === 'incomplete')
        .map((connection) => {
            const { missing } = connection.resolved;

            return {
                agent: connection.name,
                message: `The connection "${connection.name}" is incomplete${missing.length > 0 ? `: missing ${missing.join(', ')}` : ''}.`,
                at,
            };
        });
}

/** One row's stored config; a failure names the connection, never a value. */
async function readStoredConnection(container: IContainer, name: string): Promise<Pick<StoredConnection, 'values' | 'revision'> | undefined> {
    try {
        return await container.resolve(AppToken.CONNECTION_CONFIGS).read(name);
    } catch (error) {
        if (isSchemaBehindError(error)) {
            throw error;
        }

        // our messages name variables, key ids and connections; a driver's may quote anything
        const reason = error instanceof ChamviError ? error.message : 'the read failed';

        throw new InvalidAgentDefinitionError(`The connection "${name}" cannot be read: ${reason}`);
    }
}

/**
 * The stored connections of `type` with their decrypted values, for a
 * module's `setup` (list `ModuleName.STORE` in `dependencies`). Nothing for a
 * store without connections. A row that cannot be read (undecryptable, stored
 * secrets without `CHAMVI_ENCRYPTION_KEYS`) throws InvalidAgentDefinitionError
 * naming the connection, never a value. With `name`, only that row is read:
 * rows of other names are skipped before decryption, so an unreadable row of
 * another module cannot fail this one. A check never migrates: one that
 * finds the store behind its migrations warns and returns nothing.
 */
export async function readStoredConnections(
    container: IContainer,
    type: string,
    options: ReadStoredConnectionsOptions = {},
): Promise<StoredConnection[]> {
    const { connections } = container.resolve(AppToken.STORE);

    if (!connections) {
        return [];
    }

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
                    createdAt: row.createdAt,
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
