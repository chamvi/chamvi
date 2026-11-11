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

/**
 * The answer of an async function of `source`, kept current: recomputed
 * whenever the source changes, an answer a newer one overtook is dropped,
 * and a rejection falls back to `initial`. Meant for permission verdicts
 * (`can`/`canSome` are async), so `initial` is what holds while the
 * answer is pending: `false` keeps a gated control hidden.
 */
export function useResolved<T, R>(
    source: WatchSource<T>,
    resolve: (value: T) => Promise<R>,
    initial: R,
): Readonly<Ref<R>> {
    const value = shallowRef<R>(initial) as Ref<R>;
    let generation = 0;
    let active = true;

    if (getCurrentScope()) {
        onScopeDispose(() => {
            active = false;
        });
    }

    watch(source, async (input) => {
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
    }, { immediate: true });

    return value;
}
