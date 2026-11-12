/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/**
 * `String.prototype.toWellFormed` (ES2024) where the browser lacks it
 * (Firefox 114 to 118 of the dashboard's browser target):
 * `@authup/access` calls it in every permission check, which would then
 * fail closed. Replaces each lone surrogate with U+FFFD, as specified.
 */
export function installStringPolyfills(): void {
    if (typeof String.prototype.toWellFormed === 'function') {
        return;
    }

    // a polyfill of a standard method, installed only where the browser lacks it
    // eslint-disable-next-line no-extend-native
    Object.defineProperty(String.prototype, 'toWellFormed', {
        configurable: true,
        writable: true,
        enumerable: false,
        value: function toWellFormed(this: unknown): string {
            if (this === null || this === undefined) {
                throw new TypeError('String.prototype.toWellFormed called on null or undefined');
            }

            const input = String(this);
            let output = '';

            for (let i = 0; i < input.length; i++) {
                const code = input.charCodeAt(i);

                if (code >= 0xD800 && code <= 0xDBFF) {
                    const next = input.charCodeAt(i + 1);

                    if (next >= 0xDC00 && next <= 0xDFFF) {
                        output += input[i]! + input[i + 1]!;
                        i++;
                    } else {
                        output += '�';
                    }
                } else if (code >= 0xDC00 && code <= 0xDFFF) {
                    output += '�';
                } else {
                    output += input[i]!;
                }
            }

            return output;
        },
    });
}
