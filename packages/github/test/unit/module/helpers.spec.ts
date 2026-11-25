/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { variableOf } from '../../../src/module/helpers.ts';

describe('variableOf', () => {
    it('names the default instance GITHUB_*', () => {
        expect(variableOf('github', 'appId')).toBe('GITHUB_APP_ID');
        expect(variableOf('github', 'privateKey')).toBe('GITHUB_APP_PRIVATE_KEY');
        expect(variableOf('github', 'baseUrl')).toBe('GITHUB_API_URL');
    });

    it('names a named instance GITHUB_<NAME>_*, upper-cased with - as _', () => {
        expect(variableOf('acme', 'appId')).toBe('GITHUB_ACME_APP_ID');
        expect(variableOf('acme-eu', 'webhookSecret')).toBe('GITHUB_ACME_EU_WEBHOOK_SECRET');
    });
});
