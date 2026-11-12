/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    getCurrentScope,
    onScopeDispose,
    shallowRef,
    watch,
} from 'vue';
import type { Ref, WatchSource } from 'vue';
import { VERDICT_REFRESH_MS } from './constants.ts';
import type { ResolvedOptions } from './types.ts';

/**
 * The answer of an async function of `source`, kept current: recomputed
 * whenever the source changes and every `refreshMs` (a `date` or `time`
 * policy changes a verdict while nothing else does), an answer a newer one
 * overtook is dropped, and a rejection falls back to `initial`. Meant for
 * permission verdicts (`can`/`canSome` are async), so `initial` is what
 * holds until the first answer: `false` keeps a gated control hidden. A
 * changed source keeps the last answer until the new one arrives, unless
 * `reset` is set (a verdict that must not outlive the principal or
 * resource it was given for).
 */
export function useResolved<T, R>(
    source: WatchSource<T>,
    resolve: (value: T) => Promise<R>,
    initial: R,
    options: ResolvedOptions = {},
): Readonly<Ref<R>> {
    const value = shallowRef<R>(initial) as Ref<R>;
    const refreshMs = options.refreshMs ?? VERDICT_REFRESH_MS;
    // called unbound: a browser's timer functions throw when `this` is not the window
    const { set, clear } = options.timers ?? { set: setInterval, clear: clearInterval };
    let generation = 0;
    let active = true;
    let latest: { input: T } | undefined;

    const run = async (input: T) => {
        const current = ++generation;
        let next: R;

        try {
            next = await resolve(input);
        } catch {
            next = initial;
        }

        if (active && current === generation) {
            value.value = next;
        }
    };

    // outside a scope nothing would ever stop the timer
    if (getCurrentScope()) {
        const timer = refreshMs > 0 ?
            set(() => {
                if (latest) {
                    void run(latest.input);
                }
            }, refreshMs) :
            undefined;

        onScopeDispose(() => {
            active = false;

            if (timer !== undefined) {
                clear(timer);
            }
        });
    }

    watch(source, (input) => {
        if (options.reset && latest) {
            value.value = initial;
        }

        latest = { input };

        return run(input);
    }, { immediate: true });

    return value;
}
