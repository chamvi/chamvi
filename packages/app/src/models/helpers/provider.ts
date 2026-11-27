/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { AGENT_NAME_MAX_LENGTH, AGENT_NAME_PATTERN } from '@chamvi/core-kit';
import { PROVIDER_TYPES } from '../constants.ts';
import type { ProviderType } from '../types.ts';

/** The env form of a provider name: `team-a` -> `TEAM_A` (as in `PROVIDER_TEAM_A_TYPE`). */
export function providerEnvName(name: string): string {
    return name.toUpperCase().replaceAll('-', '_');
}

/** The provider name of an env form (`TEAM_A` -> `team-a`), undefined when that is no provider name (the agent-name rule). */
export function providerName(envName: string): string | undefined {
    if (envName !== envName.toUpperCase()) {
        return undefined;
    }

    const name = envName.toLowerCase().replaceAll('_', '-');

    if (name.length > AGENT_NAME_MAX_LENGTH || !AGENT_NAME_PATTERN.test(name)) {
        return undefined;
    }

    return name;
}

/** True when `name` follows the agent-name rule (`team-a`, `a1`). */
export function isProviderName(name: string): boolean {
    return providerName(providerEnvName(name)) === name;
}

export function isProviderType(value: unknown): value is ProviderType {
    return typeof value === 'string' && Object.hasOwn(PROVIDER_TYPES, value);
}
