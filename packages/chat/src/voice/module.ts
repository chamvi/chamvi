/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { TimeoutError, ValidationError } from '@chamvi/core';
import { transcribe } from 'ai';
import { isObject } from 'smob';
import { hashKey, reportError } from '../channel/helpers.ts';
import type { ChatIntakeContext, ChatPayload, ResolvedChatChannelOptions } from '../channel/types.ts';
import type { ChatIncoming } from '../ingress/types.ts';
import { CHAT_VOICE_CONCURRENCY, CHAT_VOICE_NOTICE_UNCLEAR } from './constants.ts';
import type {
    ChatAudioAttachment,
    ChatVoiceNotice,
    IChatVoiceLimiter,
    ResolvedChatVoiceOptions,
} from './types.ts';

const MEDIA_TYPE_MAX_LENGTH = 255;
const MEDIA_TYPE_UNKNOWN = 'application/octet-stream';

/** What one download and transcription gave: the transcript and its size, or the failure to report. */
type ChatVoiceHeard = { text: string; bytes: number } | { error: unknown };

/**
 * The limit of one channel's voice messages in flight: at most `max` hold a
 * slot, the others wait in order. A released slot passes to the next waiter.
 */
export function createChatVoiceLimiter(max: number = CHAT_VOICE_CONCURRENCY): IChatVoiceLimiter {
    let active = 0;
    const waiting: Array<() => void> = [];

    const release = () => {
        const next = waiting.shift();

        if (next) {
            next();
        } else {
            active -= 1;
        }
    };

    const slot = () => {
        let released = false;

        return () => {
            if (released) {
                return;
            }

            released = true;
            release();
        };
    };

    return {
        acquire(signal) {
            return new Promise((resolve, reject) => {
                if (signal.aborted) {
                    reject(signal.reason);

                    return;
                }

                if (active < max) {
                    active += 1;
                    resolve(slot());

                    return;
                }

                const grant = () => {
                    signal.removeEventListener('abort', onAbort);
                    resolve(slot());
                };
                const onAbort = () => {
                    waiting.splice(waiting.indexOf(grant), 1);
                    reject(signal.reason);
                };

                waiting.push(grant);
                signal.addEventListener('abort', onAbort, { once: true });
            });
        },
    };
}

/**
 * Whether the message is a voice message the channel transcribes: `voice`
 * is on and its attachments are exactly one audio file the platform can
 * fetch (`fetchData`). Any other attachment mix is refused as without `voice`.
 */
export function isChatVoiceMessage(incoming: ChatIncoming, options: ResolvedChatChannelOptions): boolean {
    const { attachments } = incoming.message;

    if (!options.voice || !Array.isArray(attachments) || attachments.length !== 1) {
        return false;
    }

    const [audio] = attachments;

    return isObject(audio) && audio.type === 'audio' && typeof audio.fetchData === 'function';
}

function chatVoiceNoticeText(notice: ChatVoiceNotice, voice: ResolvedChatVoiceOptions): string {
    if (notice === 'long') {
        return `Voice message too long: at most ${Math.max(1, Math.floor(voice.maxSeconds / 60))} minutes.`;
    }

    return CHAT_VOICE_NOTICE_UNCLEAR;
}

/**
 * Reports why a voice message starts no run and posts its notice to the
 * chat through the channel's own `out`, keyed per message
 * (`voice:<hash>:<notice>`). A failed send is reported, never thrown.
 */
async function refuseChatVoice(
    ctx: ChatIntakeContext,
    payload: ChatPayload,
    address: string,
    notice: ChatVoiceNotice,
    error: unknown,
): Promise<void> {
    const { context, options } = ctx;
    const key = `voice:${hashKey([payload.adapter, payload.threadId, payload.message.id])}:${notice}`;

    reportError(options, error);

    try {
        await ctx.out({
            kind: 'message',
            key,
            runId: '',
            agent: '',
            body: chatVoiceNoticeText(notice, options.voice!),
        }, address, {
            signal: ctx.signal,
            // no run: a minimal envelope of the message
            trigger: {
                id: key,
                agent: '',
                trigger: 'voice',
                channel: options.name,
                payload: structuredClone(payload),
                address,
                receivedAt: new Date(context.engine.clock.now()),
            },
        });
    } catch (sent) {
        reportError(options, sent);
    }
}

/** Settles with `promise`, or rejects with the signal's reason once it aborts (a call ignoring its signal holds nothing). */
function untilAborted<T>(promise: PromiseLike<T>, signal: AbortSignal): Promise<T> {
    let release = () => {};
    const aborted = new Promise<never>((_resolve, reject) => {
        if (signal.aborted) {
            reject(signal.reason);

            return;
        }

        const listener = () => reject(signal.reason);

        signal.addEventListener('abort', listener, { once: true });
        release = () => signal.removeEventListener('abort', listener);
    });

    return Promise.race([promise, aborted]).finally(release);
}

function toBytes(data: unknown): Uint8Array | undefined {
    if (data instanceof Uint8Array) {
        return data;
    }

    if (data instanceof ArrayBuffer) {
        return new Uint8Array(data);
    }

    return undefined;
}

/**
 * Downloads and transcribes the audio within `timeoutMs` on the engine's
 * clock. A failure (the download, a body above `maxBytes`, the model, an
 * empty transcript, the timeout) is returned to report; the channel's stop
 * rejects with its reason.
 */
async function hearChatVoice(ctx: ChatIntakeContext, audio: ChatAudioAttachment): Promise<ChatVoiceHeard> {
    const { options, context } = ctx;
    const voice = options.voice!;
    const timeout = new AbortController();
    const signal = AbortSignal.any([ctx.signal, timeout.signal]);
    const refused = (reason: string) => new ValidationError(`Chat channel "${options.name}" could not transcribe a voice message: ${reason}.`);
    const timer = context.engine.clock.setTimeout(() => {
        timeout.abort(new TimeoutError(voice.timeoutMs, `Chat channel "${options.name}" could not transcribe a voice message within ${voice.timeoutMs}ms.`));
    }, voice.timeoutMs);

    timer.unref?.();

    try {
        const bytes = toBytes(await untilAborted(audio.fetchData!(), signal));

        if (!bytes) {
            return { error: refused('the platform returned no bytes') };
        }

        // the reported size may lie: the fetched body counts
        if (bytes.byteLength > voice.maxBytes) {
            return { error: refused(`it exceeds ${voice.maxBytes} bytes`) };
        }

        const result = await untilAborted(transcribe({
            model: ctx.voice!.model,
            audio: bytes,
            abortSignal: signal,
            // a retry would wait on real timers, outside the clock's timeout
            maxRetries: 0,
        }), signal);
        const text = result.text.trim();

        if (text.length === 0) {
            return { error: refused('the transcript is empty') };
        }

        return { text, bytes: bytes.byteLength };
    } catch (error) {
        if (ctx.signal.aborted) {
            throw ctx.signal.reason;
        }

        return { error: timeout.signal.aborted ? timeout.signal.reason : error };
    } finally {
        timer.clear();
    }
}

/**
 * Turns a voice message (isChatVoiceMessage()) into a text message, after
 * `allowMessage` and `resolveInvoker`: the payload whose text is `label`
 * plus the trimmed transcript, with `voice` set. Undefined when a notice
 * went to the chat instead (no run): a reported duration above
 * `maxSeconds` or size above `maxBytes` (nothing downloaded), or a failed
 * download or transcription (each reported to `onError`). At most
 * `CHAT_VOICE_CONCURRENCY` messages of a channel are downloaded and
 * transcribed at once; the bytes live in memory only.
 */
export async function transcribeChatVoice(
    ctx: ChatIntakeContext,
    incoming: ChatIncoming,
    payload: ChatPayload,
    address: string,
): Promise<ChatPayload | undefined> {
    const { options } = ctx;
    const voice = options.voice!;
    const audio = incoming.message.attachments[0] as ChatAudioAttachment;
    const seconds = typeof audio.durationSeconds === 'number' && Number.isFinite(audio.durationSeconds) && audio.durationSeconds >= 0 ?
        audio.durationSeconds :
        undefined;

    if ((seconds !== undefined && seconds > voice.maxSeconds) || (typeof audio.size === 'number' && audio.size > voice.maxBytes)) {
        await refuseChatVoice(ctx, payload, address, 'long', new ValidationError(
            `Chat channel "${options.name}" refused a voice message of adapter "${payload.adapter}": it exceeds ${voice.maxSeconds}s or ${voice.maxBytes} bytes.`,
        ));

        return undefined;
    }

    const release = await ctx.voice!.limiter.acquire(ctx.signal);
    let heard: ChatVoiceHeard;

    try {
        heard = await hearChatVoice(ctx, audio);
    } finally {
        release();
    }

    if ('error' in heard) {
        await refuseChatVoice(ctx, payload, address, 'unclear', heard.error);

        return undefined;
    }

    const { mimeType } = audio;

    return {
        ...payload,
        message: { ...payload.message, text: voice.label + heard.text },
        voice: {
            mediaType: typeof mimeType === 'string' && mimeType.length > 0 && mimeType.length <= MEDIA_TYPE_MAX_LENGTH && !mimeType.includes('\0') ?
                mimeType :
                MEDIA_TYPE_UNKNOWN,
            bytes: heard.bytes,
            ...(seconds !== undefined ? { seconds } : {}),
        },
    };
}
