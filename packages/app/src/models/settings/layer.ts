/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { PROVIDER_TYPES } from '../constants.ts';
import { assertBaseUrl, assertHeaderName, isProviderType } from '../helpers/index.ts';
import type { ProviderConfig, SettingSource } from '../types.ts';
import { attemptSettingField, reportSettingIssue } from './issues.ts';
import type { ProviderLayer, SettingIssues } from './types.ts';

export function emptyLayer(): ProviderLayer {
    return { headers: {} };
}

/** A code or config file provider as a layer; a problem is an issue for the name. */
export function configLayer(name: string, config: ProviderConfig, source: SettingSource, prefix: string, issues: SettingIssues): ProviderLayer {
    const layer = emptyLayer();
    const field = `${prefix}providers.${name}`;
    const raw: unknown = config.type;

    if (isProviderType(raw)) {
        layer.type = { value: raw, source };
    } else {
        reportSettingIssue(issues, `${field}.type must be one of ${Object.keys(PROVIDER_TYPES).join(', ')}.`, name);
    }

    if (typeof config.apiKey !== 'undefined') {
        layer.apiKey = {
            value: config.apiKey,
            source,
            label: `${field}.apiKey`,
        };
    }

    if (typeof config.baseURL !== 'undefined') {
        const label = `${field}.baseURL`;

        attemptSettingField(issues, name, () => {
            layer.baseURL = {
                value: assertBaseUrl(String(config.baseURL), label),
                source,
                label,
            };
        });
    }

    for (const [header, value] of Object.entries(config.headers ?? {})) {
        const label = `${field}.headers.${header}`;

        attemptSettingField(issues, name, () => {
            layer.headers[assertHeaderName(header, label)] = {
                value,
                source,
                label,
            };
        });
    }

    return layer;
}

/** Layers merged low to high: per field, or wholesale when a higher layer sets another type. */
export function mergeLayers(layers: readonly ProviderLayer[]): ProviderLayer | undefined {
    let merged: ProviderLayer | undefined;

    for (const layer of layers) {
        if (!merged || (layer.type && merged.type && layer.type.value !== merged.type.value)) {
            merged = { ...layer, headers: { ...layer.headers } };

            continue;
        }

        merged = {
            type: layer.type ?? merged.type,
            apiKey: layer.apiKey ?? merged.apiKey,
            baseURL: layer.baseURL ?? merged.baseURL,
            headers: { ...merged.headers, ...layer.headers },
        };
    }

    return merged;
}
