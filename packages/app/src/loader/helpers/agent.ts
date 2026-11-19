/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    Agent,
    ModelAgentDefinition,
    RemoteAgentDefinition,
    SimpleAgentDefinition,
} from '@chamvi/core';
import {
    InvalidAgentDefinitionError,
    defineModelAgent,
    defineRemoteAgent,
    defineSimpleAgent,
} from '@chamvi/core';
import { isObject } from 'smob';
import type { DeclaredAgent } from '../types.ts';

/** The default export of a module namespace, or an error naming the file. */
export function defaultExportOf(mod: unknown, file: string): unknown {
    if ((isObject(mod) || typeof mod === 'function') && 'default' in mod) {
        return (mod as { default: unknown }).default;
    }

    throw new InvalidAgentDefinitionError(`${file}: has no default export.`);
}

/**
 * Whether `value` has an agent's shape (`name` a string, `definition` an
 * object), checked structurally so an agent built by another `@chamvi/core`
 * copy passes too; folder and package agents share this rule.
 */
export function isDeclaredAgent(value: unknown): value is DeclaredAgent {
    return isObject(value) && typeof value.name === 'string' && isObject(value.definition);
}

/**
 * A declared agent rebuilt through this copy's factory of its `kind`
 * (defineModelAgent(), defineSimpleAgent() or defineRemoteAgent()), so its
 * checks and defaults apply. One without a kind (built by an older core) is a model
 * agent; with `run` it is refused.
 */
export function rebuildAgent(declared: DeclaredAgent): Agent {
    const { kind } = declared as DeclaredAgent & { kind?: unknown };
    const definition = { ...declared.definition, name: declared.name };

    if (kind === 'simple') {
        return defineSimpleAgent(definition as SimpleAgentDefinition);
    }

    if (kind === 'remote') {
        return defineRemoteAgent(definition as RemoteAgentDefinition);
    }

    if (kind === undefined && declared.definition.run !== undefined) {
        throw new InvalidAgentDefinitionError(`Agent "${declared.name}" declares "run" but no kind; build it with defineSimpleAgent().`);
    }

    if (kind !== undefined && kind !== 'model') {
        throw new InvalidAgentDefinitionError(`Agent "${declared.name}" has kind ${JSON.stringify(kind) ?? String(kind)}; build it with defineModelAgent(), defineSimpleAgent() or defineRemoteAgent().`);
    }

    return defineModelAgent(definition as ModelAgentDefinition);
}
