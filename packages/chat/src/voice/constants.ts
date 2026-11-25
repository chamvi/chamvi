/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** Default bound of one voice message's size, reported or fetched: 10 MiB. */
export const CHAT_VOICE_MAX_BYTES = 10 * 1024 * 1024;

/** Default bound of one voice message's reported duration: 5 minutes. */
export const CHAT_VOICE_MAX_SECONDS = 300;

/** Default bound of the download and the transcription of one voice message together. */
export const CHAT_VOICE_TIMEOUT_MS = 60_000;

/** Default prefix of a transcript in the message text, so the agent knows it was spoken (and may be misheard). */
export const CHAT_VOICE_LABEL = '[Voice message] ';

/** At most this many voice messages of one channel are downloaded and transcribed at once (internal). */
export const CHAT_VOICE_CONCURRENCY = 2;

/** The notice for a voice message that was not transcribed (internal). */
export const CHAT_VOICE_NOTICE_UNCLEAR = 'I could not understand the voice message.';
