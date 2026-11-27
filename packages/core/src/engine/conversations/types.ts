/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { 
    ConversationBinding, 
    ConversationIdentity, 
    ConversationScope, 
    Run, 
    TriggerParent, 
} from '@chamvi/core-kit';
import type {
    ChannelContext,
    ChannelDispatchEnvelope,
    DispatchResult,
    IChannel,
} from '../../channel/types.ts';
import type {
    ConversationInspection,
    ConversationTarget,
    IConversations,
} from '../../conversation/types.ts';
import type { EngineContext } from '../context/types.ts';
import type { DispatchEnvelope, IEngine } from '../types.ts';

/** The engine's conversation operations and the channel contexts bound to them (internal). */
export interface IEngineConversations {
    capability(): IConversations;
    inspect(identity: ConversationIdentity, query?: { limit?: number; offset?: number }): Promise<ConversationInspection | undefined>;
    reset(identity: ConversationIdentity, options?: { keepNotes?: boolean }): Promise<ConversationScope>;
    delete(identity: ConversationIdentity): Promise<void>;
    prune(): Promise<void>;
    intake(channel: IChannel, envelope: ChannelDispatchEnvelope, target: ConversationTarget): Promise<DispatchResult>;
    channelContext(channel: IChannel): ChannelContext;
    reconcile(run: Run): Promise<void>;
}

/** What EngineConversations needs from the engine (internal). */
export type EngineConversationsContext = Pick<EngineContext, 'getAgent' | 'getChannel' | 'onError' | 'isStarted'> & {
    /** The conversation capability, when the engine has one. */
    conversations?: IConversations;
    /** The engine a channel context hands out. */
    engine: IEngine;
    /** The engine's dispatch(). */
    dispatch(envelope: DispatchEnvelope): Promise<DispatchResult>;
    /** Intake's createRun(). */
    createRun(envelope: DispatchEnvelope, parent?: TriggerParent, conversation?: ConversationBinding): Promise<DispatchResult>;
    /** Lets deferred runs try their conversation again. */
    retryDeferred(): void;
    /** Starts a scheduling pass. */
    pump(): Promise<void>;
};
