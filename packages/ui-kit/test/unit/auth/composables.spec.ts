/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { effectScope, nextTick, shallowRef } from 'vue';
import { useResolved } from '../../../src/auth/composables.ts';
import { flush } from '../../utils/timers.ts';

function deferred<T>() {
    return Promise.withResolvers<T>();
}

describe('useResolved', () => {
    it('holds the initial value until the first answer arrives', async () => {
        const scope = effectScope();
        const gate = deferred<boolean>();
        const value = scope.run(() => useResolved(() => 'a', () => gate.promise, false))!;

        expect(value.value).toBe(false);

        gate.resolve(true);
        await flush();

        expect(value.value).toBe(true);
        scope.stop();
    });

    it('follows its source and drops an answer a newer source overtook', async () => {
        const scope = effectScope();
        const source = shallowRef('slow');
        const answers = new Map([['slow', deferred<string>()], ['fast', deferred<string>()]]);
        const value = scope.run(() => useResolved(source, (name) => answers.get(name)!.promise, 'none'))!;

        source.value = 'fast';
        await nextTick();
        answers.get('fast')!.resolve('fast');
        await flush();
        answers.get('slow')!.resolve('slow');
        await flush();

        expect(value.value).toBe('fast');
        scope.stop();
    });

    it('keeps the initial value when the answer rejects', async () => {
        const scope = effectScope();
        const value = scope.run(() => useResolved(() => 1, () => Promise.reject(new Error('no')), false))!;

        await flush();

        expect(value.value).toBe(false);
        scope.stop();
    });

    it('ignores an answer that arrives after its scope stopped', async () => {
        const scope = effectScope();
        const gate = deferred<boolean>();
        const value = scope.run(() => useResolved(() => 1, () => gate.promise, false))!;

        scope.stop();
        gate.resolve(true);
        await flush();

        expect(value.value).toBe(false);
    });
});
