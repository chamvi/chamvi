/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError } from '@chamvi/core';
import { describe, expect, it } from 'vitest';
import { testFailureMessage } from '../../../src/connections/helpers/test.ts';

function failure(message: string): ChamviError {
    return new ChamviError({ message, code: 'mail_request' });
}

describe('testFailureMessage', () => {
    it('removes a secret another secret is a prefix of, whatever their order', () => {
        const message = 'login refused for sk-live-123';

        expect(testFailureMessage(failure(message), ['sk-', 'sk-live-123'])).toBe('login refused for [secret]');
        expect(testFailureMessage(failure(message), ['sk-live-123', 'sk-'])).toBe('login refused for [secret]');
    });

    it('removes a secret contained in another one', () => {
        expect(testFailureMessage(failure('token abc-secret-xyz refused'), ['secret', 'abc-secret-xyz'])).toBe('token [secret] refused');
    });

    it('keeps the shorter secret out where it stands alone', () => {
        expect(testFailureMessage(failure('sk- and sk-live-123'), ['sk-', 'sk-live-123'])).toBe('[secret] and [secret]');
    });

    it('answers a generic message for a foreign error', () => {
        expect(testFailureMessage(new Error('sk-live-123'), ['sk-live-123'])).toBe('The connection test failed.');
    });
});
