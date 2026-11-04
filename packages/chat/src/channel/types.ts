/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    ChannelContext,
    ConversationTarget,
    IChannel,
    IClock,
    Invoker,
} from '@chamvi/core';
import type { Chat } from 'chat';
import type { ChatIncoming, ChatIngress } from '../ingress/types.ts';
import type { ChatSubscriber } from '../subscription/types.ts';

/** How a message reached the bot: a direct chat, a mention in a group, any other group message. */
export type ChatEvent = 'direct' | 'mention' | 'message';

/** The envelope payload of a run a chat channel started; no raw provider object. */
export type ChatPayload = {
    adapter: string;
    event: ChatEvent;
    threadId: string;
    channelId: string;
    message: {
        id: string;
        text: string;
        author: { id: string; name?: string };
        sentAt?: string;
    };
};

/** What approvalUrl() gets: ids only, never a token. */
export type ChatApprovalRef = {
    runId: string;
    approvalId: string;
    agent: string;
};

export type ChatChannelOptions = {
    /** The Chat the adapters are registered with; the channel owns it alone. */
    chat: Chat;
    /** The wrapped adapters of createChatIngressAdapter(), each registered with `chat` under its name. */
    adapters: readonly ChatIngress[];
    /** Default `chat`. */
    name?: string;
    /**
     * The adapters (names of `adapters`) whose platform posts webhooks to
     * `POST /channels/<name>/<adapter>` (the http app's channel mount);
     * none by default, and without any the channel has no `in`. Each adapter
     * verifies its own requests (handleWebhook); GET challenges are not
     * served.
     */
    webhooks?: readonly string[];
    /**
     * The address emit()/approve() use without one off the source channel.
     * Not set by default: it is an ungated destination for a tainted run.
     */
    defaultAddress?: string;
    /**
     * Default true: every run the channel starts is tainted
     * (`channel:<name>`). Set false only for a fully trusted private deployment.
     */
    untrusted?: boolean;
    /**
     * The operator's non-secret alias of the account the bot uses (the
     * conversation account); default the adapter's name.
     */
    account?: string;
    /**
     * Called on start after the Chat initialized, e.g. to open a socket. It
     * must settle once `signal` aborts (a stop during the start): stop waits
     * for it before `disconnect`, and the start then rejects with the
     * signal's reason whether it resolved or rejected.
     */
    connect?: (ctx: { signal: AbortSignal; clock: IClock }) => Promise<void>;
    /** Called on stop (and after a failed start) before the Chat shuts down. */
    disconnect?: () => Promise<void>;
    /** Decides whether a message may start runs at all; required for every adapter. */
    allowMessage: (incoming: ChatIncoming) => boolean | Promise<boolean>;
    /** The invoker of the runs a message starts; none by default. */
    resolveInvoker?: (incoming: ChatIncoming) => Invoker | undefined | Promise<Invoker | undefined>;
    /**
     * The approval link in approval messages (ids only, an absolute http(s)
     * URL without credentials); required to send an approval, since an
     * approval is answered in the UI only.
     */
    approvalUrl?: (ref: ChatApprovalRef) => string;
    /** Platform-fetched history; only 0 (none) for now. */
    history?: 0;
    /** Bound of one outbound send; default `CHAT_TIMEOUT_MS` (30 s). */
    timeoutMs?: number;
    /**
     * The longest text one send posts, in UTF-16 code units: an integer of 1
     * to `CHAT_TEXT_MAX_CHARS` (the default), e.g. a platform's own message
     * limit. A longer message is refused, an approval's prose cut to fit.
     */
    maxTextChars?: number;
    /** Failures nobody awaits (refused and failed messages, stop); default console.error. */
    onError?: (error: unknown) => void;
    /** A platform package's hooks (IChatPlatform); none by default. */
    platform?: IChatPlatform;
};

export type ChatChannel = IChannel & ChatSubscriber;

/** The options after resolveOptions() (internal). */
export type ResolvedChatChannelOptions = {
    chat: Chat;
    adapters: readonly ChatIngress[];
    adapterNames: readonly string[];
    name: string;
    webhooks: readonly string[];
    defaultAddress?: string;
    untrusted: boolean;
    account?: string;
    connect?: ChatChannelOptions['connect'];
    disconnect?: ChatChannelOptions['disconnect'];
    allowMessage: ChatChannelOptions['allowMessage'];
    resolveInvoker?: ChatChannelOptions['resolveInvoker'];
    approvalUrl?: ChatChannelOptions['approvalUrl'];
    timeoutMs: number;
    maxTextChars: number;
    onError: (error: unknown) => void;
    platform?: IChatPlatform;
};

/** One send a platform prepares (IChatPlatform.prepare): the target, the rendered text and the message key. */
export type ChatPlatformSend = {
    /** The adapter the address names (a name of `adapters`). */
    adapter: string;
    /** The thread the address names, as the adapter encodes it. */
    threadId: string;
    /** The text the channel rendered (title, body, approval link), at most the channel's `maxTextChars`. */
    text: string;
    /** `ChannelMessage.key`: the same for every retry of one message, so a transport may derive its own message id from it. */
    key: string;
};

/**
 * The post IChatPlatform.prepare returns: called once per send with a signal
 * that aborts when the channel stops waiting for it (the send's own signal,
 * or the `timeoutMs` deadline, whichever comes first), so the platform can
 * cancel its request. A post that ignores the signal may still deliver.
 */
export type ChatPlatformPost = (signal: AbortSignal) => Promise<unknown>;

/**
 * What a platform package built on the channel adds (`chatChannel({ platform })`,
 * e.g. `@chamvi/chat-whatsapp`): its connection state, its own send and the
 * conversation identity of its messages. Every hook is optional and called on
 * the platform object (`this` is the platform); a missing hook keeps the
 * default. The channel checks at construction that `platform` is an object
 * whose given hooks are functions and, for a plain object, that it has no
 * other key (InvalidAgentDefinitionError otherwise; a class instance may keep
 * state in its own fields).
 * The platform's socket lifecycle stays with `connect`/`disconnect` and its
 * message policy with `allowMessage`/`resolveInvoker`.
 */
export interface IChatPlatform {
    /**
     * Whether the transport is connected, asked once per send after `prepare`
     * and only while the channel is started (before `start` finished and from
     * `stop` on the channel sends nothing whatever this answers). False refuses
     * the send (`chat_request`, nothing posted). Default true: the channel
     * sends while it is started.
     */
    online?(): boolean;
    /**
     * Prepares one send of `out`, after the address decoded and the message
     * rendered, before the online check. It throws to refuse a target the
     * transport cannot reach (the error reaches the caller as is, nothing goes
     * out), else returns the post (ChatPlatformPost) the channel calls once
     * and waits for, bounded by `timeoutMs` and the send's signal; the post
     * gets a signal that aborts at whichever comes first (a rejection or
     * throw of the post is a `chat_request`; a post that settles after the
     * channel stopped waiting is reported to `onError`). Default the
     * adapter's `postMessage(threadId, { raw: text })`, which takes no signal.
     */
    prepare?(input: ChatPlatformSend): ChatPlatformPost;
    /**
     * The conversation of a message for an agent with `conversation`, asked
     * per such agent after `allowMessage` allowed the message, its text was
     * accepted and `resolveInvoker` ran (never for a refused message).
     * Undefined refuses that agent's dispatch (a refusal, reported as
     * `chat_intake_failed`; other agents still get their run); a throw fails
     * the message's intake. Default from the payload: the `account` alias
     * (else the adapter), the thread, `direct:<author>` or `group:<channel>`,
     * the message text.
     */
    conversationTarget?(incoming: ChatIncoming, payload: ChatPayload): ConversationTarget | undefined;
}

/** What the intake of one message gets besides the message (internal). */
export type ChatIntakeContext = {
    context: ChannelContext;
    /** Aborts when the channel stops. */
    signal: AbortSignal;
    options: ResolvedChatChannelOptions;
};

/** Accepts one incoming message: resolves once it is durably accepted (internal). */
export type ChatIntake = (incoming: ChatIncoming, ctx: ChatIntakeContext) => Promise<void>;
