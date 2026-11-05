/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import * as tool from '@chamvi/tool-mail';
import * as module from '@chamvi/tool-mail/module';

describe('package entry', () => {
    it('resolves', () => {
        expect(tool).toBeDefined();
        expect(tool.MAIL_REQUEST_ERROR_CODE).toBe('mail_request');
    });

    it('resolves the module entry', () => {
        expect(module).toBeDefined();
        expect(module.TOOL_MAIL_MODULE_NAME).toBe('chamvi:tool-mail');
    });
});
