/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { envString } from '../../env/module.ts';
import type { Env } from '../../env/types.ts';
import { BUILTIN_PROVIDERS, PROVIDER_TYPES } from '../constants.ts';
import { assertBaseUrl, isProviderType, providerEnvName } from '../helpers/index.ts';
import { readSecret } from '../secret.ts';
import type { ProviderSettings } from '../types.ts';
import { ENV_PREFIX } from './constants.ts';
import { issueMessageOf, reportSettingIssue } from './issues.ts';
import type { ProviderLayer, SettingIssues } from './types.ts';

export async function resolveProvider(
    name: string,
    layer: ProviderLayer,
    context: { env: Env; cwd: string },
    issues: SettingIssues,
): Promise<ProviderSettings | undefined> {
    if (!layer.type) {
        return undefined;
    }

    const settings: ProviderSettings = {
        name,
        type: layer.type.value,
        headers: {},
        sources: { type: layer.type.source, headers: {} },
    };

    try {
        if (layer.apiKey) {
            settings.apiKey = await readSecret(layer.apiKey.value, { ...context, field: layer.apiKey.label });
            settings.sources.apiKey = layer.apiKey.source;
        }

        for (const [header, field] of Object.entries(layer.headers)) {
            settings.headers[header] = await readSecret(field.value, { ...context, field: field.label });
            settings.sources.headers[header] = field.source;
        }
    } catch (error) {
        reportSettingIssue(issues, issueMessageOf(error), name);

        return undefined;
    }

    if (layer.baseURL) {
        settings.baseURL = layer.baseURL.value;
        settings.sources.baseURL = layer.baseURL.source;
    }

    if (issues.failed.has(name)) {
        // A refused field reads as missing; its own issue already names it.
        return undefined;
    }

    const envName = `${ENV_PREFIX}${providerEnvName(name)}`;

    if (PROVIDER_TYPES[settings.type].keyRequired && typeof settings.apiKey === 'undefined') {
        reportSettingIssue(issues, `Provider "${name}" (${settings.type}) needs ${envName}_API_KEY.`, name);
    }

    if (settings.type === 'openai-compatible' && typeof settings.baseURL === 'undefined') {
        reportSettingIssue(issues, `Provider "${name}" (${settings.type}) needs ${envName}_BASE_URL.`, name);
    }

    return settings;
}

export function implicitProviders(env: Env, declared: ReadonlySet<string>, issues: SettingIssues): ProviderSettings[] {
    const providers: ProviderSettings[] = [];

    for (const builtin of BUILTIN_PROVIDERS) {
        const apiKey = declared.has(builtin.id) ? undefined : envString(env, builtin.apiKey);

        if (typeof apiKey === 'undefined' || !isProviderType(builtin.id)) {
            continue;
        }

        const settings: ProviderSettings = {
            name: builtin.id,
            type: builtin.id,
            apiKey,
            headers: {},
            sources: {
                type: 'implicit',
                apiKey: 'implicit',
                headers: {},
            },
        };
        const baseURL = builtin.baseUrl ? envString(env, builtin.baseUrl) : undefined;

        if (builtin.baseUrl && typeof baseURL !== 'undefined') {
            try {
                settings.baseURL = assertBaseUrl(baseURL, builtin.baseUrl);
                settings.sources.baseURL = 'implicit';
            } catch (error) {
                reportSettingIssue(issues, issueMessageOf(error), builtin.id);

                continue;
            }
        }

        providers.push(settings);
    }

    return providers;
}
