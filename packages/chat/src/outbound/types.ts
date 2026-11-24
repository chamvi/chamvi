/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '@chamvi/core';
import type { Adapter } from 'chat';
import type { ResolvedChatAnswerOptions } from '../answer/types.ts';
import type { ChatApprovalRef, ChatPlatformPost, ChatPlatformSend } from '../channel/types.ts';

/** What createChatSender() sends through (internal). */
export type ChatSenderOptions = {
    /** The channel name, for error texts. */
    name: string;
    /** The adapters an address may name, by their name. */
    adapters: readonly Adapter[];
    /** The approval link; required to send an approval not answerable in the chat (with options, generic, to a group, or without `answers`). */
    approvalUrl?: (ref: ChatApprovalRef) => string;
    /**
     * Set when approvals are answered in the chat: an answerable one (to a
     * direct message, no options, not generic) gets the hint line and no cut.
     */
    answers?: ResolvedChatAnswerOptions;
    /** The platform matches quoted approvals (`sentMessageId`): picks the hint an answerable approval ends with. */
    quotes?: boolean;
    /** Bound of one send. */
    timeoutMs: number;
    /** The longest text one send posts (UTF-16 code units). */
    maxTextChars: number;
    /**
     * The clock of a connected channel, else undefined: an offline channel
     * (not started, stopped, a transport that reports itself down) sends nothing.
     */
    online: () => IClock | undefined;
    /** The platform's own send (IChatPlatform.prepare); default the adapter's postMessage. */
    prepare?: (input: ChatPlatformSend) => ChatPlatformPost;
    /** Outcomes nobody waits for any more (a send that settled after its deadline or abort). */
    onError: (error: unknown) => void;
};

/** What renderChatMessage() reads of the options (internal); `maxTextChars` defaults to `CHAT_TEXT_MAX_CHARS`. */
export type ChatRenderOptions = Pick<ChatSenderOptions, 'answers' | 'approvalUrl' | 'quotes'> & Partial<Pick<ChatSenderOptions, 'maxTextChars'>> & {
    /** The destination is a direct message (the adapter's `isDM`): only there `answers` makes an approval answerable. */
    direct?: boolean;
};

/** What rendering a message for an address needs: `out`, `fits` and `direct` share it. */
export type ChatRenderSetup = Pick<ChatSenderOptions, 'adapters' | 'answers' | 'approvalUrl' | 'quotes' | 'maxTextChars'>;
