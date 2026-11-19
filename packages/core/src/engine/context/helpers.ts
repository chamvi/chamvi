/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { assertChannelName, assertDefaultAddress } from '../../channel/helpers.ts';
import type { IChannel } from '../../channel/types.ts';
import { contextKeyName, isContextKey } from '../../context/helpers.ts';
import type { ContextKey } from '../../context/types.ts';
import { Conversations } from '../../conversation/module.ts';
import type { IConversations } from '../../conversation/types.ts';
import { InvalidAgentDefinitionError } from '../../errors/index.ts';
import type { EngineEvent, EngineOptions } from '../types.ts';
import type { EngineContext } from './types.ts';

/** The conversation capability of EngineOptions.conversations, which needs a conversation service. */
export function createEngineConversations(opts: EngineOptions): IConversations | undefined {
    if (opts.conversations === undefined) {
        return undefined;
    }

    if (!opts.conversationService) {
        throw new InvalidAgentDefinitionError('Conversations need a conversation service.');
    }

    return new Conversations(
        opts.conversations,
        opts.conversationService,
        opts.runService,
        opts.effectService,
    );
}

/** The channels by name, in registration order; refuses a bad name or default address and a name used twice. */
export function toEngineChannelMap(channels: readonly IChannel<any, any>[]): Map<string, IChannel<any, any>> {
    const map = new Map<string, IChannel<any, any>>();

    for (const channel of channels) {
        assertChannelName(channel.name);
        assertDefaultAddress(channel);

        if (map.has(channel.name)) {
            throw new InvalidAgentDefinitionError(`The channel "${channel.name}" is registered more than once.`);
        }

        map.set(channel.name, channel);
    }

    return map;
}

/**
 * Provides `value` for inject(ctx, key) by reference. Refuses a key not made
 * by this copy's defineContextKey(), `undefined` and a second value for one key.
 */
export function provideEngineContextValue<T>(provided: EngineContext['provided'], key: ContextKey<T>, value: T): void {
    const name = contextKeyName(key);

    if (!isContextKey(key)) {
        throw new InvalidAgentDefinitionError(
            `Context "${name}" has no key from defineContextKey() of the engine's @chamvi/core: ` +
            'a key from another copy of @chamvi/core (a package that resolved its own) is refused.',
        );
    }

    if (value === undefined) {
        throw new InvalidAgentDefinitionError(`Context "${name}" needs a value.`);
    }

    if (provided.has(key)) {
        throw new InvalidAgentDefinitionError(`Context "${name}" is already provided.`);
    }

    provided.set(key, value);
}

/** Adds `listener` for events of type `event` to `listeners`; the returned function removes it. */
export function subscribeEngineEvent<T extends EngineEvent['type']>(
    listeners: EngineContext['listeners'],
    event: T,
    listener: (e: Extract<EngineEvent, { type: T }>) => void,
): () => void {
    const wrapped = (e: EngineEvent) => {
        if (e.type === event) {
            listener(e as Extract<EngineEvent, { type: T }>);
        }
    };

    listeners.add(wrapped);

    return () => {
        listeners.delete(wrapped);
    };
}
