/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ChannelMessage, ChannelSendOptions, IChannel } from '@chamvi/core';
import type { Adapter } from 'chat';
import { decodeChatAddress, reportError } from '../channel/helpers.ts';
import { messageOf, renderChatMessage, requestError } from './helpers.ts';
import type { ChatSenderOptions } from './types.ts';

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
    const adapters = new Map<string, Adapter>(options.adapters.map((adapter) => [adapter.name, adapter]));
    const names = options.adapters.map((adapter) => adapter.name);

    return async (message: ChannelMessage, address: string, opts: ChannelSendOptions): Promise<void> => {
        const target = decodeChatAddress(address, names);
        const text = renderChatMessage(message, options);
        const adapter = adapters.get(target.adapter)!;
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
            let timer: { clear(): void } | undefined;
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
