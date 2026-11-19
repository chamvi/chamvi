/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { envString } from '../../env/module.ts';
import type { Env } from '../../env/types.ts';
import { PROVIDER_TYPES } from '../constants.ts';
import {
    assertBaseUrl,
    assertHeaderName,
    headerName,
    isProviderType,
    providerEnvName,
    providerName,
} from '../helpers/index.ts';
import type { SettingSource } from '../types.ts';
import { ENV_PREFIX, HEADER_PREFIX } from './constants.ts';
import { attemptSettingField, reportSettingIssue } from './issues.ts';
import type {
    EnvBinding,
    EnvField,
    ProviderLayer,
    SettingIssues,
} from './types.ts';

function parseEnvField(suffix: string): EnvField | undefined {
    if (suffix === 'TYPE') {
        return { kind: 'type' };
    }

    if (suffix === 'API_KEY') {
        return { kind: 'apiKey' };
    }

    if (suffix === 'BASE_URL') {
        return { kind: 'baseURL' };
    }

    if (suffix.startsWith(HEADER_PREFIX) && suffix.length > HEADER_PREFIX.length) {
        return { kind: 'header', header: suffix.slice(HEADER_PREFIX.length) };
    }

    return undefined;
}

/** Binds `rest` (the variable without the prefix) to the longest name it fits. */
function bindEnvVariable(rest: string, names: readonly string[]): { name: string; field: EnvField } | undefined {
    const sorted = [...names].sort((a, b) => b.length - a.length);

    for (const name of sorted) {
        const envName = `${providerEnvName(name)}_`;

        if (rest.startsWith(envName)) {
            const field = parseEnvField(rest.slice(envName.length));

            if (field) {
                return { name, field };
            }
        }
    }

    return undefined;
}

/** The provider name a variable that fits no declared name most likely means. */
function guessProviderName(rest: string): string | undefined {
    for (const suffix of ['_TYPE', '_API_KEY', '_BASE_URL']) {
        if (rest.endsWith(suffix)) {
            return providerName(rest.slice(0, -suffix.length));
        }
    }

    const index = rest.indexOf(`_${HEADER_PREFIX}`);

    return providerName(index === -1 ? rest : rest.slice(0, index));
}

/**
 * Binds every `CHAMVI_PROVIDER_*` variable: (1) to the names code and file
 * declare, longest first; (2) a still unmatched `_TYPE` declares an env-only
 * provider; (3) the rest bind to those; (4) anything left is an issue.
 */
export function bindEnvVariables(env: Env, declared: ReadonlySet<string>, issues: SettingIssues): EnvBinding[] {
    const unmatched: Array<{
        variable: string;
        value: string;
        rest: string
    }> = [];
    const bindings: EnvBinding[] = [];

    for (const variable of Object.keys(env).sort()) {
        const value = variable.startsWith(ENV_PREFIX) ? envString(env, variable) : undefined;

        if (typeof value === 'undefined') {
            continue;
        }

        const rest = variable.slice(ENV_PREFIX.length);
        const bound = bindEnvVariable(rest, [...declared]);

        if (bound) {
            bindings.push({
                variable,
                value,
                ...bound,
            });
        } else {
            unmatched.push({
                variable,
                value,
                rest,
            });
        }
    }

    const envDeclared = new Set<string>();

    for (const { rest } of unmatched) {
        const name = rest.endsWith('_TYPE') ? providerName(rest.slice(0, -'_TYPE'.length)) : undefined;

        if (name) {
            envDeclared.add(name);
        }
    }

    for (const {
        variable,
        value,
        rest,
    } of unmatched) {
        const bound = bindEnvVariable(rest, [...envDeclared]);

        if (bound) {
            bindings.push({
                variable,
                value,
                ...bound,
            });

            continue;
        }

        const name = guessProviderName(rest);

        if (name) {
            reportSettingIssue(
                issues,
                `${variable} names provider "${name}", which no source declares; ` +
                `set ${ENV_PREFIX}${providerEnvName(name)}_TYPE or fix the name.`,
                name,
            );
        } else {
            reportSettingIssue(
                issues,
                `${variable} names no provider; provider variables are ${ENV_PREFIX}<NAME>_TYPE, _API_KEY, _BASE_URL ` +
                'or _HEADER_<HEADER>, with <NAME> the upper-snake provider name.',
            );
        }
    }

    return bindings;
}

export function applyEnvBinding(layer: ProviderLayer, binding: EnvBinding, issues: SettingIssues): void {
    const {
        variable,
        value,
        name,
        field,
    } = binding;
    const source: SettingSource = 'env';

    switch (field.kind) {
        case 'type':
            if (isProviderType(value)) {
                layer.type = { value, source };
            } else {
                reportSettingIssue(issues, `${variable} must be one of ${Object.keys(PROVIDER_TYPES).join(', ')}.`, name);
            }

            break;
        case 'apiKey':
            layer.apiKey = {
                value,
                source,
                label: variable,
            };

            break;
        case 'baseURL':
            attemptSettingField(issues, name, () => {
                layer.baseURL = {
                    value: assertBaseUrl(value, variable),
                    source,
                    label: variable,
                };
            });

            break;
        default:
            attemptSettingField(issues, name, () => {
                layer.headers[assertHeaderName(headerName(field.header), variable)] = {
                    value,
                    source,
                    label: variable,
                };
            });
    }
}
