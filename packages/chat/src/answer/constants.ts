/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** Default bound of one classification of a chat reply to an approval. */
export const CHAT_ANSWER_TIMEOUT_MS = 15_000;

/** The line an answerable approval message ends with (`answers` on, no options). */
export const CHAT_ANSWER_HINT = 'Reply to this message to approve or deny.';

/** The notice for a reply that names no approval while several are open in the chat. */
export const CHAT_ANSWER_NOTICE_SEVERAL = 'Several approvals are open here. Reply to the approval message you mean.';

/** The notice for a reply to an approval that is no longer open. */
export const CHAT_ANSWER_NOTICE_CLOSED = 'This approval is no longer open.';
