/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { ValidationError } from '@chamvi/core';
import { encodeMailId, parseMailId } from '@chamvi/tool-mail';

describe('mail ids', () => {
    it('round-trips account, folder, uidvalidity and uid', () => {
        const id = encodeMailId({
            account: 'work',
            folder: '[Gmail]/All Mail: ö',
            uidValidity: '42',
            uid: 7,
        });

        expect(id).toMatch(/^work:[\w-]+:42:7$/);
        expect(parseMailId(id)).toEqual({
            account: 'work',
            folder: '[Gmail]/All Mail: ö',
            uidValidity: '42',
            uid: 7,
        });
    });

    it.each([
        'garbage',
        '',
        'work:SU5CT1g:42',
        'work:SU5CT1g:42:7:1',
        'work:SU5CT1g:x:7',
        'work:SU5CT1g:42:0',
        'work:SU5CT1g:42:abc',
        'work:SU5CT1g:42:99999999999',
        'Work:SU5CT1g:42:7',
        'work:SU5CT1g=:42:7',
        'work::42:7',
    ])('refuses %j', (id) => {
        expect(() => parseMailId(id)).toThrow(ValidationError);
    });
});
