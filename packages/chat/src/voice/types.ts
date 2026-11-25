/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { TranscriptionModelRef } from '@chamvi/core';
import type { TranscriptionModel } from 'ai';
import type { Attachment } from 'chat';

/**
 * Voice messages (`chatChannel({ voice })`): a message whose only
 * attachment is one fetchable audio file is transcribed and continues as a
 * text message, the transcript after `label`.
 */
export type ChatVoiceOptions = {
    /** The transcription model: a `'<provider>/<model id>'` string (the engine's resolver) or a TranscriptionModel. */
    model: TranscriptionModelRef;
    /** The largest voice message, reported or fetched, in bytes; default `CHAT_VOICE_MAX_BYTES` (10 MiB). */
    maxBytes?: number;
    /** The longest voice message by its reported duration; default `CHAT_VOICE_MAX_SECONDS` (300). */
    maxSeconds?: number;
    /** Bound of the download and the transcription together; default `CHAT_VOICE_TIMEOUT_MS` (60 s). */
    timeoutMs?: number;
    /** Put before the transcript; default `CHAT_VOICE_LABEL`. */
    label?: string;
};

/** The voice options after resolveOptions() (internal). */
export type ResolvedChatVoiceOptions = {
    model: TranscriptionModelRef;
    maxBytes: number;
    maxSeconds: number;
    timeoutMs: number;
    label: string;
};

/**
 * An audio attachment as a platform package lists it: the Chat SDK
 * `Attachment` plus its reported duration in seconds, when the platform
 * knows it before the download. The channel transcribes only one with
 * `fetchData`.
 */
export type ChatAudioAttachment = Attachment & { durationSeconds?: number };

/** What a run's payload says of a transcribed voice message: never its bytes. */
export type ChatVoicePayload = {
    mediaType: string;
    /** The fetched size. */
    bytes: number;
    /** The duration the platform reported, if any. */
    seconds?: number;
};

/** One slot of the voice concurrency limit (internal). */
export interface IChatVoiceLimiter {
    /** Waits for a free slot; rejects with the signal's reason once it aborts while waiting. */
    acquire(signal: AbortSignal): Promise<() => void>;
}

/** What a started voice-enabled channel holds (internal): the resolved model and the channel's limit. */
export type ChatVoiceRuntime = {
    model: TranscriptionModel;
    limiter: IChatVoiceLimiter;
};

/** The notices of voice messages (internal): too long, or not understood. */
export type ChatVoiceNotice = 'long' | 'unclear';
