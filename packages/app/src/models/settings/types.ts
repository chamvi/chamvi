/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    ModelIssue,
    ProviderType,
    SecretValue,
    SettingSource,
} from '../types.ts';

/** One field value of one source: the value and the field or variable named in errors. */
export type LayerField<T> = {
    value: T;
    source: SettingSource;
    label: string
};

/** What one source says about one provider name. */
export type ProviderLayer = {
    type?: { value: ProviderType; source: SettingSource };
    apiKey?: LayerField<SecretValue>;
    baseURL?: LayerField<string>;
    headers: Record<string, LayerField<SecretValue>>;
};

export type EnvField = { kind: 'type' | 'apiKey' | 'baseURL' } | { kind: 'header'; header: string };

export type EnvBinding = {
    variable: string;
    value: string;
    name: string;
    field: EnvField
};

export type SettingIssues = {
    list: ModelIssue[];
    /** Provider names with an issue: left out of the settings. */
    failed: Set<string>;
};
