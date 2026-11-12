/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

type Method = 'log' | 'info' | 'warn' | 'error' | 'debug';

const METHODS: readonly Method[] = ['log', 'info', 'warn', 'error', 'debug'];

/** A stack frame from the libsignal package (a `libsignal` path segment, either separator). */
const LIBSIGNAL_FRAME = /[\\/]libsignal[\\/]/;

let installs = 0;
let originals: Partial<Record<Method, Console[Method]>> = {};

/**
 * libsignal (a Baileys dependency) writes session objects, private ratchet
 * keys included, to the global console. While installed, a console call made
 * from libsignal's code is dropped; every other call reaches the original
 * method unchanged. Reference counted: the release of the last install puts
 * the original methods back. The returned release is idempotent.
 */
export function guardConsole(): () => void {
    if (installs === 0) {
        originals = {};

        for (const method of METHODS) {
            const original = console[method];

            originals[method] = original;
            console[method] = function guarded(this: Console, ...args: unknown[]) {
                if (LIBSIGNAL_FRAME.test(new Error('stack').stack ?? '')) {
                    return;
                }

                original.apply(this, args);
            };
        }
    }

    installs += 1;

    let released = false;

    return () => {
        if (released) {
            return;
        }

        released = true;
        installs -= 1;

        if (installs > 0) {
            return;
        }

        for (const method of METHODS) {
            console[method] = originals[method]!;
        }

        originals = {};
    };
}
