/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError, ErrorCode } from '@chamvi/errors';
import { describe, expect, it } from 'vitest';
import { SandboxError } from '@chamvi/core';

describe('SandboxError', () => {
    it('carries code sandbox_error and the cause', () => {
        const cause = new Error('daemon');
        const e = new SandboxError('create failed', { cause });

        expect(e).toBeInstanceOf(ChamviError);
        expect(e.code).toBe('sandbox_error');
        expect(e.code).toBe(ErrorCode.SANDBOX);
        expect(e.message).toBe('create failed');
        expect(e.cause).toBe(cause);
    });

    it('has no cause without one', () => {
        const e = new SandboxError('workspace disposed');

        expect(e.message).toBe('workspace disposed');
        expect(e.cause).toBeUndefined();
    });
});
