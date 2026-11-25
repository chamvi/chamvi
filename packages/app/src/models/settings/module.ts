/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ModelRef } from '@chamvi/core';
import { envString } from '../../env/module.ts';
import type { Env } from '../../env/types.ts';
import { isProviderName } from '../helpers/index.ts';
import type {
    ModelIssue,
    ModelSettings,
    ProviderConfig,
    ProviderSettings,
} from '../types.ts';
import { MODEL_VARIABLE } from './constants.ts';
import { applyEnvBinding, bindEnvVariables } from './env.ts';
import { readFileLayer } from './file.ts';
import { reportSettingIssue } from './issues.ts';
import { configLayer, emptyLayer, mergeLayers } from './layer.ts';
import { implicitProviders, resolveProvider } from './provider.ts';
import type { ProviderLayer, SettingIssues } from './types.ts';

/**
 * The app's model settings, layered per provider name and field: env over the
 * config file (`CONFIG_FILE`, else `./chamvi.json` when it exists) over
 * code. Collects every issue; a provider with an issue is left out. No issue
 * holds a secret value.
 */
export async function readModelSettings(input: {
    env: Env;
    cwd: string;
    model?: ModelRef;
    providers?: Readonly<Record<string, ProviderConfig>>;
}): Promise<{ settings: ModelSettings; issues: ModelIssue[] }> {
    const { env, cwd } = input;
    const issues: SettingIssues = { list: [], failed: new Set() };
    const layers = new Map<string, ProviderLayer[]>();
    const add = (name: string, layer: ProviderLayer) => {
        layers.set(name, [...(layers.get(name) ?? []), layer]);
    };

    for (const [name, config] of Object.entries(input.providers ?? {})) {
        if (!isProviderName(name)) {
            reportSettingIssue(issues, `createApp: providers.${name} is no provider name (must match ^[a-z0-9]+(-[a-z0-9]+)*$, at most 64 characters).`);

            continue;
        }

        add(name, configLayer(name, config, 'code', 'createApp: ', issues));
    }

    const file = await readFileLayer(env, cwd, issues);

    for (const [name, config] of Object.entries(file.providers)) {
        add(name, configLayer(name, config, 'file', '', issues));
    }

    const envLayers = new Map<string, ProviderLayer>();

    for (const binding of bindEnvVariables(env, new Set(layers.keys()), issues)) {
        const layer = envLayers.get(binding.name) ?? emptyLayer();

        envLayers.set(binding.name, layer);
        applyEnvBinding(layer, binding, issues);
    }

    for (const [name, layer] of envLayers) {
        add(name, layer);
    }

    const providers = new Map<string, ProviderSettings>();

    for (const [name, list] of layers) {
        const merged = mergeLayers(list);
        const settings = merged ? await resolveProvider(name, merged, { env, cwd }, issues) : undefined;

        if (settings && !issues.failed.has(name)) {
            providers.set(name, settings);
        }
    }

    for (const settings of implicitProviders(env, new Set(layers.keys()), issues)) {
        if (!issues.failed.has(settings.name)) {
            providers.set(settings.name, settings);
        }
    }

    const settings: ModelSettings = { providers };
    const envModel = envString(env, MODEL_VARIABLE);

    if (typeof envModel !== 'undefined') {
        settings.model = { ref: envModel, source: 'env' };
    } else if (typeof file.model !== 'undefined') {
        settings.model = { ref: file.model, source: 'file' };
    } else if (typeof input.model !== 'undefined') {
        settings.model = { ref: input.model, source: 'code' };
    }

    if (typeof file.path !== 'undefined') {
        settings.configFile = file.path;
    }

    return { settings, issues: issues.list };
}
