/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Permission, can } from '@chamvi/access';
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

    it('installs a fallback without the method (Firefox before 119), and checks pass again', async () => {
        delete prototype.toWellFormed;

        const holder = { bindings: [{ permission: { name: Permission.AGENT_RUN } }] };

        await expect(can(holder, Permission.AGENT_RUN)).resolves.toBe(false);

        installStringPolyfills();

        expect(prototype.toWellFormed).not.toBe(native);
        expect(Object.getOwnPropertyDescriptor(String.prototype, 'toWellFormed')?.enumerable).toBe(false);
        await expect(can({ bindings: [{ permission: { name: Permission.AGENT_RUN } }] }, Permission.AGENT_RUN)).resolves.toBe(true);
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
