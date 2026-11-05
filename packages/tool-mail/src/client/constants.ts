/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** Milliseconds one mail tool call may take, connecting included. */
export const MAIL_TIMEOUT_MS = 30_000;

/** The default and the largest `limit` of `mail_search` and `mail_thread`. */
export const MAIL_SEARCH_DEFAULT_LIMIT = 20;
export const MAIL_SEARCH_MAX_LIMIT = 50;

/** References of a mail `mail_thread` follows (the last ones, nearest the mail). */
export const MAIL_THREAD_MAX_REFERENCES = 10;

/** Characters of a search result's snippet, and the bytes of the text part read for it. */
export const MAIL_SNIPPET_CHARS = 200;
export const MAIL_SNIPPET_BYTES = 2048;

/** Folder names left out of the default search scope when the server marks no special use. */
export const MAIL_EXCLUDED_FOLDER_NAMES = /trash|junk|spam|papierkorb|gel(ö|oe)scht/i;

/** The message of a mail id whose folder changed UIDVALIDITY or no longer holds the mail. */
export const MAIL_STALE_ID_MESSAGE = 'mail id is stale, search again';
