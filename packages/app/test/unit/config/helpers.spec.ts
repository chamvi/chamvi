/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { approvalUrlOf, readConfig } from '@chamvi/app';


describe('approvalUrlOf', () => {
    it('is undefined without a public URL', () => {
        expect(approvalUrlOf(readConfig({}, { mode: 'start' }))).toBeUndefined();
    });

    it('builds the UI approval link under the base path', () => {
        const config = readConfig({
            PUBLIC_URL: 'https://a.example',
            BASE_PATH: '/api',
        }, { mode: 'start' });
        const url = approvalUrlOf(config);

        expect(url?.({ runId: 'r 1', approvalId: 'a/1' }))
            .toBe('https://a.example/api/ui/approvals?run=r%201&approval=a%2F1');
    });
});
