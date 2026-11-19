/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ToolSet } from 'ai';
import { assertConcurrencyMaxRuns } from '../channel/concurrency.ts';
import type { ChannelSubscription } from '../channel/types.ts';
import { DEFAULT_DISPATCH_ROLE } from '../dispatch/constants.ts';
import { assertOwnDispatchRoles } from '../dispatch/helpers.ts';
import { InvalidAgentDefinitionError } from '../errors/index.ts';
import { assertInstructions } from '../message/helpers.ts';
import { REMOTE_TIMEOUT_DEFAULT_MS } from '../peer/constants.ts';
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
    assertPrivate,
    assertRemoteAgent,
    assertSimpleAgent,
    assertSubtreeBudget,
    assertToolsContext,
    conversationKey,
    isName,
} from './asserts.ts';
import type {
    ModelAgent,
    ModelAgentDefinition,
    RemoteAgent,
    RemoteAgentDefinition,
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
export function defineSimpleAgent<S extends StateSchema = StateSchema, T extends ToolSet = ToolSet>(
    def: SimpleAgentDefinition<S, T>,
): SimpleAgent<S, T> {
    assertName(def.name);
    assertSimpleAgent(def);

    return { kind: 'simple', ...build(def) } as SimpleAgent<S, T>;
}

/**
 * An agent whose runs a peer executes: a run here is a stand-in waiting on
 * the remote run. `agent` defaults to `name`, `role` to `default`,
 * `timeoutMs` to 24 h.
 */
export function defineRemoteAgent(def: RemoteAgentDefinition): RemoteAgent {
    assertName(def.name);
    assertRemoteAgent(def);
    assertDescription(def);
    assertPrivate(def);
    assertConcurrencyMaxRuns(def.concurrencyMaxRuns, `Agent "${def.name}" concurrencyMaxRuns`);
    assertSubscriptions(def.name, def.channels);

    return {
        kind: 'remote',
        name: def.name,
        definition: {
            ...def,
            agent: def.agent ?? def.name,
            role: def.role ?? DEFAULT_DISPATCH_ROLE,
            timeoutMs: def.timeoutMs ?? REMOTE_TIMEOUT_DEFAULT_MS,
        },
    };
}

/**
 * Whether `value` follows the agent-name rule: lowercase letters and digits
 * in words joined by single hyphens, at most `AGENT_NAME_MAX_LENGTH`
 * characters (agent, channel, role and peer names).
 */
export function isAgentName(value: unknown): value is string {
    return isName(value);
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

/** Each subscription's `concurrencyMaxRuns` is valid and its id unique per agent. */
function assertSubscriptions(agent: string, channels: ChannelSubscription[] | undefined): void {
    const seen = new Set<string>();

    for (const subscription of channels ?? []) {
        assertConcurrencyMaxRuns(subscription.concurrencyMaxRuns, `Agent "${agent}" subscription "${subscription.id}" concurrencyMaxRuns`);

        if (seen.has(subscription.id)) {
            throw new InvalidAgentDefinitionError(
                `Agent "${agent}" has duplicate subscription id "${subscription.id}".`,
            );
        }

        seen.add(subscription.id);
    }
}

/** The checks the model and simple kinds share, then the definition with its budget defaults. */
function build<S extends StateSchema>(
    def: ModelAgentDefinition<S> | SimpleAgentDefinition<S>,
): { name: string; definition: ModelAgentDefinition<S> | SimpleAgentDefinition<S> } {
    assertDescription(def);
    assertPrivate(def);

    // Factories, state and skills can add tools; validate their names after assembly.
    const completeTools = typeof def.tools === 'function' || def.state || def.skills?.length ?
        undefined :
        def.tools ?? {};

    assertAgentTrust(def.trust, completeTools);
    assertConcurrencyMaxRuns(def.concurrencyMaxRuns, `Agent "${def.name}" concurrencyMaxRuns`);
    assertSubtreeBudget(def.name, def.budget);
    conversationKey(def);
    assertSubscriptions(def.name, def.channels);

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
    } as ModelAgentDefinition<S> | SimpleAgentDefinition<S>;

    return { name: def.name, definition };
}
