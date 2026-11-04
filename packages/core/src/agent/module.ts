/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { assertConcurrencyMaxRuns } from '../channel/concurrency.ts';
import { assertOwnDispatchRoles } from '../dispatch/helpers.ts';
import { InvalidAgentDefinitionError } from '../errors/index.ts';
import { assertInstructions } from '../message/helpers.ts';
import { assertAgentTrust } from '../trust/asserts.ts';
import { snapshotSkillInputs } from '../skill/helpers.ts';
import type { StateSchema } from '../state/types.ts';
import {
    DEFAULT_MAX_STEPS,
    DEFAULT_TIMEOUT_MS,
    NAME_MAX_LENGTH,
    NAME_PATTERN,
} from './constants.ts';
import {
    assertDescription,
    assertModelAgent,
    assertNoNeedsApproval,
    assertSimpleAgent,
    assertSubtreeBudget,
    assertToolsContext,
    conversationKey,
} from './asserts.ts';
import type {
    AgentDefinition,
    ModelAgent,
    ModelAgentDefinition,
    SimpleAgent,
    SimpleAgentDefinition,
} from './types.ts';

/** An agent whose runs call a language model, with the budget defaults applied. */
export function defineModelAgent<S extends StateSchema = StateSchema>(def: ModelAgentDefinition<S>): ModelAgent<S> {
    assertName(def.name);
    assertModelAgent(def);
    assertInstructions(def.instructions);

    return { kind: 'model', ...build(def) } as ModelAgent<S>;
}

/**
 * A model-free agent whose `run(payload, ctx)` the engine runs as a durable
 * run, with the budget defaults applied.
 */
export function defineSimpleAgent<S extends StateSchema = StateSchema>(def: SimpleAgentDefinition<S>): SimpleAgent<S> {
    assertName(def.name);
    assertSimpleAgent(def);

    return { kind: 'simple', ...build(def) } as SimpleAgent<S>;
}

/**
 * @deprecated Use defineModelAgent(); defineAgent() is removed in a later
 * release. A definition with `run` is refused: use defineSimpleAgent().
 */
export function defineAgent<S extends StateSchema = StateSchema>(def: ModelAgentDefinition<S>): ModelAgent<S> {
    return defineModelAgent(def);
}

function assertName(name: unknown): void {
    if (
        typeof name !== 'string' ||
        name.length > NAME_MAX_LENGTH ||
        !NAME_PATTERN.test(name)
    ) {
        throw new InvalidAgentDefinitionError(
            `Invalid agent name "${String(name)}": must match ${NAME_PATTERN} and be at most ${NAME_MAX_LENGTH} characters.`,
        );
    }
}

/** The checks both kinds share, then the definition with its budget defaults. */
function build<S extends StateSchema>(def: AgentDefinition<S>): { name: string; definition: AgentDefinition<S> } {
    assertDescription(def);

    // Factories, state and skills can add tools; validate their names after assembly.
    const completeTools = typeof def.tools === 'function' || def.state || def.skills?.length ?
        undefined :
        def.tools ?? {};

    assertAgentTrust(def.trust, completeTools);
    assertConcurrencyMaxRuns(def.concurrencyMaxRuns, `Agent "${def.name}" concurrencyMaxRuns`);
    assertSubtreeBudget(def.name, def.budget);
    conversationKey(def);

    const seen = new Set<string>();

    for (const subscription of def.channels ?? []) {
        assertConcurrencyMaxRuns(subscription.concurrencyMaxRuns, `Agent "${def.name}" subscription "${subscription.id}" concurrencyMaxRuns`);

        if (seen.has(subscription.id)) {
            throw new InvalidAgentDefinitionError(
                `Agent "${def.name}" has duplicate subscription id "${subscription.id}".`,
            );
        }

        seen.add(subscription.id);
    }

    const skills = snapshotSkillInputs(
        def.skills,
        typeof def.tools === 'function' ? {} : def.tools ?? {},
    );

    // a factory's set is only known per execution, the engine checks it there
    if (typeof def.tools !== 'function') {
        assertNoNeedsApproval(def.name, def.tools ?? {});
        assertOwnDispatchRoles(def.name, def.channels, def.tools ?? {});

        if (def.toolsContext) {
            assertToolsContext(def.name, def.tools ?? {}, def.toolsContext);
        }
    }

    // the spread keeps the definition's kind; the factories cast to their own
    const definition = {
        ...def,
        ...(def.skills !== undefined && { skills }),
        budget: {
            maxSteps: DEFAULT_MAX_STEPS,
            timeoutMs: DEFAULT_TIMEOUT_MS,
            ...def.budget,
        },
    } as AgentDefinition<S>;

    return { name: def.name, definition };
}
