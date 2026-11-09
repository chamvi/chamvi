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
import { verifyGithubApp } from '../app/verify.ts';
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
export function githubConnectionDefinition(options: Pick<GithubAppOptions, 'fetch' | 'clock'> = {}): ConnectionTypeDefinition {
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
                multiline: true,
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
                bindsSecrets: true,
            }),
        ],
        // saved values only; a normalizer's message may quote the value
        test: async (values, signal) => {
            try {
                await verifyGithubApp({ ...options, ...appOptionsOf(values) }, signal);
            } catch (error) {
                throw error instanceof InvalidAgentDefinitionError ? new InvalidAgentDefinitionError(withoutValue(error.message)) : error;
            }
        },
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

/** The field a normalizer's message starts with, when it names one. */
function refusedKey(definition: ConnectionTypeDefinition, message: string): string | undefined {
    return definition.fields.find((field) => message.startsWith(`${field.key} `))?.key;
}

/** The connection without `keys`: unset, `missing` naming only the required fields left without a value, `incomplete`. */
function withoutFields(definition: ConnectionTypeDefinition, resolved: ResolvedConnection, keys: readonly string[]): ResolvedConnection {
    const values = Object.fromEntries(Object.entries(resolved.values).filter(([key]) => !keys.includes(key)));
    const sources = Object.fromEntries(Object.entries(resolved.sources).map(([key, source]) => [key, keys.includes(key) ? { kind: 'unset' as const } : source]));

    return {
        ...resolved,
        values,
        sources,
        missing: definition.fields.filter((field) => field.required && values[field.key] === undefined).map((field) => field.key),
        state: 'incomplete',
    };
}

/** Rethrows a refusal that is no stored problem: env and code errors still fail the start, env ones naming the variable, never the value. */
function assertStoredRefusal(definition: ConnectionTypeDefinition, resolved: ResolvedConnection, error: InvalidAgentDefinitionError): void {
    const key = refusedKey(definition, error.message);
    const source = key === undefined ? undefined : resolved.sources[key];
    const stored = key === undefined ?
        Object.values(resolved.sources).some((candidate) => candidate.kind === 'store') :
        source?.kind === 'store';

    if (stored) {
        return;
    }

    if (key !== undefined && source?.kind === 'env') {
        throw new InvalidAgentDefinitionError(`${source.variable}${withoutValue(error.message.slice(key.length))}`);
    }

    throw error;
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
 * while it is not configured or a refused stored value leaves it without a
 * required field. A refused stored value is dropped and the connection listed
 * `incomplete`, so the dashboard can repair it. A required field missing from
 * env and store while another comes from env throws naming the variable
 * (`resolveConnection`), as does a refused value that is not stored.
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

    const resolved = resolve(row?.values);

    if (resolved.state !== 'configured') {
        logger.warn(`The GitHub connection "${name}" is ${resolved.state.replace('_', ' ')}; it stays idle until it is configured.`);

        return { resolved };
    }

    /**
     * Drops the refused stored field (the optional stored ones when the
     * message names none) and tries again. Each pass drops at least one
     * field, and nothing here throws: the dashboard repairs what is left.
     */
    const recover = (current: ResolvedConnection, refusal: Error): { resolved: ResolvedConnection; app?: IGithubApp } => {
        const key = refusedKey(definition, refusal.message);
        const drop = key !== undefined && current.sources[key]?.kind === 'store' ?
            [key] :
            definition.fields.filter((field) => !field.required && current.sources[field.key]?.kind === 'store').map((field) => field.key);

        if (drop.length === 0) {
            logger.warn(`The GitHub connection "${name}" cannot be used (${withoutValue(refusal.message)}); it stays idle until it is repaired.`);

            return {
                resolved: {
                    ...current, 
                    state: 'incomplete', 
                    reason: withoutValue(refusal.message), 
                }, 
            };
        }

        logger.warn(`The GitHub connection "${name}" holds a stored value the App refuses (${withoutValue(refusal.message)}); it is ignored.`);

        const next = { ...withoutFields(definition, current, drop), reason: withoutValue(refusal.message) };

        if (next.missing.length > 0) {
            logger.warn(`The GitHub connection "${name}" is incomplete; it stays idle until it is repaired.`);

            return { resolved: next };
        }

        try {
            return { resolved: next, app: build(next) };
        } catch (error) {
            return recover(next, error as Error);
        }
    };

    try {
        return { resolved, app: build(resolved) };
    } catch (error) {
        if (!(error instanceof InvalidAgentDefinitionError)) {
            throw error;
        }

        assertStoredRefusal(definition, resolved, error);

        return recover(resolved, error);
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
