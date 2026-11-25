/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    ChannelMessage,
    ChannelSendOptions,
    ClockTimer,
    IChannel,
} from '@chamvi/core';
import type { Adapter } from 'chat';
import { decodeChatAddress, isDirectChatThread, reportError } from '../channel/helpers.ts';
import { messageOf, renderChatMessage, requestError } from './helpers.ts';
import type { ChatRenderSetup, ChatSenderOptions } from './types.ts';

type ChatRendered = {
    target: { adapter: string; threadId: string };
    adapter: Adapter;
    text: string;
};

/** Decodes the address and renders the message as `out` posts it (its errors come before any post). */
function createChatRenderer(options: ChatRenderSetup): (message: ChannelMessage, address: string) => ChatRendered {
    const adapters = new Map<string, Adapter>(options.adapters.map((adapter) => [adapter.name, adapter]));
    const names = options.adapters.map((adapter) => adapter.name);

    return (message, address) => {
        const target = decodeChatAddress(address, names);
        const adapter = adapters.get(target.adapter)!;
        // an approval is answerable in a direct message only, as intake answers only those; without answers isDM is never asked
        const direct = !!options.answers && message.kind === 'approval' && isDirectChatThread(adapter, target.threadId);

        return {
            target,
            adapter,
            text: renderChatMessage(message, { ...options, direct }),
        };
    };
}

/**
 * The `fits` and `direct` of a chat channel. `fits` renders the message as
 * `out` would (renderChatMessage(), the same `direct` and `quotes`) and
 * throws what `out` would throw before posting: an approval answerable in
 * the chat that exceeds `maxTextChars`, or a target the platform's
 * `prepare` refuses (its post is discarded uncalled), is refused before
 * the call suspends. It checks only what is known before sending: an
 * offline channel or a failed post still leaves the approval waiting and
 * retried. `direct` is the adapter's `isDM` for the address (false for one
 * that is no chat address of the listed adapters).
 */
export function createChatChecks(options: ChatRenderSetup): Required<Pick<IChannel, 'fits' | 'direct'>> {
    const render = createChatRenderer(options);
    const adapters = new Map<string, Adapter>(options.adapters.map((adapter) => [adapter.name, adapter]));
    const names = options.adapters.map((adapter) => adapter.name);

    return {
        fits: (message, address) => {
            const { target, text } = render(message, address);

            // the platform refuses a target it cannot reach when it prepares the send; the post is never called
            options.prepare?.({
                adapter: target.adapter,
                threadId: target.threadId,
                text,
                key: message.key,
            });
        },
        direct: (address) => {
            let target: { adapter: string; threadId: string };

            try {
                target = decodeChatAddress(address, names);
            } catch {
                return false;
            }

            return isDirectChatThread(adapters.get(target.adapter)!, target.threadId);
        },
    };
}

/**
 * The `out` of a chat channel: decodes the address (ValidationError for one
 * that is no chat address of the listed adapters), renders the message
 * (renderChatMessage(), whose errors come before any post), refuses to send
 * while the channel is offline (`chat_request`), then posts the text through
 * the adapter's public `postMessage` once, as raw text: no retry here (the
 * engine's effects and approval re-delivery own repetition), no Chat SDK
 * `Thread.post`.
 *
 * Delivery is at least once. `postMessage` takes no client message id, so
 * `message.key` reaches no transport dedupe: a second call with the same key
 * posts again. A transport may supply its own send (`prepare`, e.g. one that
 * derives a message id from the key), which changes no guarantee. Core records the emit effect after `out` resolves, so a
 * failure between the post and that record sends the message again.
 *
 * Waiting is bounded by `timeoutMs` on the channel's clock and by
 * `opts.signal`. The send stops waiting and rejects (`chat_request` naming
 * the deadline, or the signal's reason) and aborts the signal it gave the
 * post with that error: a platform's post (ChatPlatformPost) may cancel its
 * request, the adapter's public `postMessage` takes no signal and may still
 * deliver. A late outcome is reported to `onError`, never left unhandled,
 * except a post that rejected with that abort reason (it honoured the
 * cancel).
 */
export function createChatSender(options: ChatSenderOptions): NonNullable<IChannel['out']> {
    const render = createChatRenderer(options);

    return async (message: ChannelMessage, address: string, opts: ChannelSendOptions): Promise<void> => {
        const {
            target,
            adapter,
            text,
        } = render(message, address);
        // a platform's own send refuses its target here, before anything goes out
        const post = options.prepare ?
            options.prepare({
                adapter: target.adapter,
                threadId: target.threadId,
                text,
                key: message.key,
            }) :
            () => adapter.postMessage(target.threadId, { raw: text });
        const clock = options.online();

        if (!clock) {
            throw requestError(`Chat channel "${options.name}" is not connected; nothing was sent.`);
        }

        const { signal } = opts;

        signal.throwIfAborted();

        // aborts once the send stops waiting (its signal or the deadline), so a platform's post can cancel
        const posted = new AbortController();
        // a synchronous throw of the adapter becomes a rejection like any other failure
        const posting = (async () => post(posted.signal))();

        await new Promise<void>((resolve, reject) => {
            let waiting = true;
            let timer: ClockTimer | undefined;
            let onAbort: () => void = () => undefined;
            const stop = (): boolean => {
                if (!waiting) {
                    return false;
                }

                waiting = false;
                timer?.clear();
                signal.removeEventListener('abort', onAbort);

                return true;
            };

            timer = clock.setTimeout(() => {
                if (!stop()) {
                    return;
                }

                const error = requestError(
                    `Chat adapter "${target.adapter}" did not answer within ${options.timeoutMs}ms; the message may still be delivered.`,
                );

                posted.abort(error);
                reject(error);
            }, options.timeoutMs);
            timer.unref?.();
            onAbort = () => {
                if (!stop()) {
                    return;
                }

                posted.abort(signal.reason);
                reject(signal.reason);
            };

            signal.addEventListener('abort', onAbort, { once: true });

            posting.then(
                () => {
                    if (stop()) {
                        resolve();

                        return;
                    }

                    reportError(options, requestError(
                        `A send through chat adapter "${target.adapter}" completed after the channel stopped waiting for it; the adapter accepted it, and a retry may send it again.`,
                    ));
                },
                (error: unknown) => {
                    if (stop()) {
                        reject(requestError(`Chat adapter "${target.adapter}" failed to send: ${messageOf(error)}`));

                        return;
                    }

                    // a post that honoured the cancel: the caller already got the reason
                    if (posted.signal.aborted && error === posted.signal.reason) {
                        return;
                    }

                    reportError(options, requestError(
                        `A send through chat adapter "${target.adapter}" failed after the channel stopped waiting for it: ${messageOf(error)}`,
                    ));
                },
            );
        });
    };
}
