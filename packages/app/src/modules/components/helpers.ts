/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '@chamvi/core';
import { isObject } from 'smob';
import { AGENT_NAME_MAX_LENGTH, AGENT_NAME_PATTERN } from '@chamvi/core-kit';
import type { AppComponent } from '../../module/types.ts';

function isComponent(value: unknown): boolean {
    return isObject(value) &&
        typeof value.start === 'function' &&
        typeof value.stop === 'function' &&
        typeof value.status === 'function';
}

/**
 * Throws InvalidAgentDefinitionError for a contribution that is no
 * `{ name, component }`, a name that breaks the agent name rule, or a name
 * contributed twice.
 */
export function assertComponents(components: readonly unknown[]): asserts components is readonly AppComponent[] {
    const names = new Set<string>();

    components.forEach((entry, index) => {
        if (!isObject(entry) || typeof entry.name !== 'string') {
            throw new InvalidAgentDefinitionError(`The component contribution #${index} has no name.`);
        }

        const { name } = entry;

        if (name.length > AGENT_NAME_MAX_LENGTH || !AGENT_NAME_PATTERN.test(name)) {
            throw new InvalidAgentDefinitionError(
                `The component name "${name}" is not lower-kebab (must match ${AGENT_NAME_PATTERN} and be at most ${AGENT_NAME_MAX_LENGTH} characters).`,
            );
        }

        if (!isComponent(entry.component)) {
            throw new InvalidAgentDefinitionError(`The component "${name}" has no start(), stop() and status().`);
        }

        if (names.has(name)) {
            throw new InvalidAgentDefinitionError(`Two modules contribute the component "${name}".`);
        }

        names.add(name);
    });
}
