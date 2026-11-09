/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { envSecret } from '@chamvi/app';
import type { Env, ILogger, StoredConnection } from '@chamvi/app';
import { InvalidAgentDefinitionError, resolveConnection } from '@chamvi/core';
import type {
    ConnectionField,
    ConnectionFieldSource,
    ConnectionTypeDefinition,
    ConnectionValue,
    ConnectionValues,
    DeclaredConnection,
    ResolvedConnection,
} from '@chamvi/core';
import { createGithubApp } from '../app/module.ts';
import type { GithubAppOptions, IGithubApp } from '../app/types.ts';
import { GITHUB_CONNECTION_TYPE } from './constants.ts';
import { splitSecrets, variableOf, withoutValue } from './helpers.ts';
import type { GithubEnvOption } from './types.ts';

function fieldOf(key: GithubEnvOption, field: Omit<ConnectionField, 'key' | 'env'>): ConnectionField {
    return {
        key,
        ...field,
        env: (connection) => variableOf(connection, key),
    };
}

/** The GitHub connection type: one App per module, its name the module's. */
export function githubConnectionDefinition(): ConnectionTypeDefinition {
    return {
        type: GITHUB_CONNECTION_TYPE,
        label: 'GitHub',
        multiple: false,
        fields: [
            fieldOf('appId', {
                label: 'App ID', 
                kind: 'string', 
                required: true, 
            }),
            fieldOf('privateKey', {
                label: 'Private key', 
                kind: 'secret', 
                required: true, 
                description: 'PEM; literal \\n sequences allowed.', 
            }),
            fieldOf('webhookSecret', {
                label: 'Webhook secret', 
                kind: 'secret', 
                required: true, 
                description: 'Comma-separated during a rotation.', 
            }),
            fieldOf('installationId', {
                label: 'Installation ID', 
                kind: 'number', 
                description: 'For runs not started by a delivery.', 
            }),
            fieldOf('slug', {
                label: 'App slug', 
                kind: 'string', 
                description: 'Skips GET /app for the bot login.', 
            }),
            fieldOf('baseUrl', {
                label: 'API URL', 
                kind: 'string', 
                description: 'Default https://api.github.com.', 
            }),
        ],
    };
}

/** What the factory took from code, which wins over everything. */
export function presetOf(options: Partial<GithubAppOptions>): Record<string, { value: ConnectionValue; source: ConnectionFieldSource }> {
    const source: ConnectionFieldSource = { kind: 'code' };
    const entries: [string, ConnectionValue | undefined][] = [
        ['appId', options.appId === undefined ? undefined : String(options.appId)],
        ['privateKey', options.privateKey],
        ['webhookSecret', options.webhookSecret as ConnectionValue | undefined],
        ['installationId', options.installationId],
        ['slug', options.slug],
        ['baseUrl', options.baseUrl],
    ];

    return Object.fromEntries(entries
        .filter((entry): entry is [string, ConnectionValue] => entry[1] !== undefined)
        .map(([key, value]) => [key, { value, source }]));
}

function appOptionsOf(values: ConnectionValues): GithubAppOptions {
    return {
        appId: values.appId as string,
        privateKey: values.privateKey as string,
        webhookSecret: splitSecrets(values.webhookSecret),
        ...(values.installationId !== undefined && { installationId: values.installationId as number }),
        ...(values.slug !== undefined && { slug: values.slug as string }),
        ...(values.baseUrl !== undefined && { baseUrl: values.baseUrl as string }),
    };
}

function storedSecretsOf(definition: ConnectionTypeDefinition, values: ConnectionValues): ConnectionValues {
    return Object.fromEntries(Object.entries(values).filter(([key]) => definition.fields.some((field) => field.key === key && field.kind === 'secret')));
}

type LoadInput = {
    name: string;
    definition: ConnectionTypeDefinition;
    env: Env;
    logger: ILogger;
    row: StoredConnection | undefined;
    /** The code options (`clock`, `fetch`, `proposals`) and the preset values. */
    options: Partial<GithubAppOptions>;
};

/**
 * Resolves the connection (env, then the store) and builds its App: none
 * while it is not configured or a stored value the App refuses leaves it
 * incomplete, so the dashboard can repair it. A required field missing while
 * another comes from env throws naming the variable (`resolveConnection`).
 */
export function loadGithubConnection(input: LoadInput): { resolved: ResolvedConnection; app?: IGithubApp } {
    const {
        name,
        definition,
        env,
        logger,
        row,
        options,
    } = input;
    const resolve = (stored: ConnectionValues | undefined) => resolveConnection({
        definition,
        name,
        readVariable: (variable) => envSecret(env, variable),
        preset: presetOf(options),
        ...(stored && { stored }),
    });
    const build = (resolved: ResolvedConnection) => createGithubApp({ ...options, ...appOptionsOf(resolved.values) });

    let resolved = resolve(row?.values);

    if (resolved.state !== 'configured') {
        logger.warn(`The GitHub connection "${name}" is ${resolved.state.replace('_', ' ')}; it stays idle until it is configured.`);

        return { resolved };
    }

    try {
        return { resolved, app: build(resolved) };
    } catch (error) {
        if (!row || !(error instanceof InvalidAgentDefinitionError)) {
            throw error;
        }

        // the messages name the option, and `withoutValue` drops the rest; a stored value is never logged
        logger.warn(`The GitHub connection "${name}" holds a stored value the App refuses (${withoutValue(error.message)}) and its stored settings are dropped.`);
    }

    resolved = { ...resolve(storedSecretsOf(definition, row.values)), state: 'incomplete' };

    if (resolved.missing.length > 0) {
        return { resolved };
    }

    try {
        return { resolved, app: build(resolved) };
    } catch (error) {
        if (!(error instanceof InvalidAgentDefinitionError)) {
            throw error;
        }

        logger.warn(`The GitHub connection "${name}" cannot be used (${withoutValue(error.message)}); it stays idle until it is repaired.`);

        return { resolved };
    }
}

/** A module given a built App: listed by its id, every field locked, no secret held. */
export function pinnedConnection(name: string, definition: ConnectionTypeDefinition, app: IGithubApp): ResolvedConnection {
    return {
        name,
        values: { appId: app.appId },
        sources: Object.fromEntries(definition.fields.map((field) => [field.key, { kind: 'code' }])),
        missing: [],
        state: 'configured',
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
