/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError, InvalidRunStateError } from '@chamvi/core';
import { messageOf } from '../../loader/helpers.ts';
import type { RegisterAgentInput, RegisterOutcome } from './types.ts';

/**
 * Checks, prepares and registers one loaded agent (a folder's or a
 * package's) the way its role allows: the `AGENT_CHECKS` and
 * `engine.checkAgent()` (role `check` stops there), `engine.prepare()`,
 * then `putAgent` at `revision` (`reload` only in role `start`). A refused
 * check or an InvalidAgentDefinitionError from `putAgent` (thrown before any
 * store write) is an `issue`, a failed preparation a `preparation` (the
 * caller decides on a retry), a job's InvalidRunStateError a `conflict`;
 * everything else (the store) throws. Messages are raw: the caller names
 * the agent and relativizes paths.
 */
export async function registerAgent(input: RegisterAgentInput): Promise<RegisterOutcome> {
    const {
        engine,
        agent,
        check,
        role,
        revision,
        signal,
    } = input;

    try {
        check(agent);
        engine.checkAgent(agent);
    } catch (error) {
        return { kind: 'issue', message: messageOf(error) };
    }

    if (role === 'check') {
        return { kind: 'checked' };
    }

    try {
        await engine.prepare({ agents: [agent], signal });
    } catch (error) {
        return { kind: 'preparation', error };
    }

    try {
        const formerRevision = await input.formerRevision?.();

        signal?.throwIfAborted();
        await engine.putAgent(agent, {
            revision,
            reload: role === 'start',
            signal,
            ...(formerRevision !== undefined && { formerRevision }),
        });
    } catch (error) {
        // refused before any store write (a model that cannot resolve, a subscription to an unknown channel)
        if (error instanceof InvalidAgentDefinitionError) {
            return { kind: 'issue', message: messageOf(error) };
        }

        // a job never reloads: the marker differs while the agent has unsettled runs
        if (role === 'job' && error instanceof InvalidRunStateError) {
            return { kind: 'conflict', message: messageOf(error) };
        }

        throw error;
    }

    return { kind: 'registered' };
}
