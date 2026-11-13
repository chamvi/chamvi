/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import { installStringPolyfills } from '../../../src/shell/polyfill.ts';

type Prototype = { toWellFormed?: () => string };

const prototype = String.prototype as Prototype;
const native = prototype.toWellFormed;

afterEach(() => {
    prototype.toWellFormed = native;
});

describe('installStringPolyfills', () => {
    it('keeps the native toWellFormed', () => {
        installStringPolyfills();

        expect(prototype.toWellFormed).toBe(native);
    });

    it('installs a non-enumerable fallback without the method (Firefox before 119)', () => {
        delete prototype.toWellFormed;

        installStringPolyfills();

        expect(typeof prototype.toWellFormed).toBe('function');
        expect(prototype.toWellFormed).not.toBe(native);
        expect(Object.getOwnPropertyDescriptor(String.prototype, 'toWellFormed')?.enumerable).toBe(false);
    });

    it('replaces lone surrogates as the specification does', () => {
        delete prototype.toWellFormed;
        installStringPolyfills();

        const fallback = (value: string) => prototype.toWellFormed!.call(value);

        expect(fallback('ab\uD800c')).toBe('ab�c');
        expect(fallback('\uDC00x\uD800')).toBe('�x�');
        expect(fallback('a😀b')).toBe('a😀b');
        expect(fallback('plain')).toBe('plain');
        expect(fallback('ab\uD800c')).toBe(native!.call('ab\uD800c'));
    });
});
