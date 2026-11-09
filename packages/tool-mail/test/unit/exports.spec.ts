/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import * as mail from '@chamvi/tool-mail';
import * as module from '@chamvi/tool-mail/module';

describe('public api', () => {
    it('exports the tools, the client, the context pair and the limits', () => {
        expect(mail.mailTools).toBeTypeOf('function');
        expect(mail.createMailClient).toBeTypeOf('function');
        expect(mail.provideMailContext).toBeTypeOf('function');
        expect(mail.injectMailContext).toBeTypeOf('function');
        expect(mail.encodeMailId).toBeTypeOf('function');
        expect(mail.parseMailId).toBeTypeOf('function');
        expect(mail.MAIL_REQUEST_ERROR_CODE).toBe('mail_request');
        expect(mail.MAIL_TIMEOUT_MS).toBe(30_000);
        expect(mail.MAIL_SEARCH_DATE_CANDIDATES).toBe(1000);
        expect(mail.MAIL_SEARCH_DEFAULT_LIMIT).toBe(20);
        expect(mail.MAIL_SEARCH_MAX_LIMIT).toBe(50);
        expect(mail.MAIL_THREAD_MAX_REFERENCES).toBe(10);
        expect(mail.MAIL_BODY_MAX_CHARS).toBe(50_000);
        expect(mail.MAIL_ATTACHMENT_MAX_CHARS).toBe(20_000);
        expect(mail.MAIL_PDF_MAX_PAGES).toBe(50);
        expect(mail.MAIL_ZIP_PART_MAX_BYTES).toBe(10 * 1024 * 1024);
        expect(mail.MAIL_HTML_MAX_CHARS).toBe(1_000_000);
        expect(mail.MAIL_FETCH_MAX_BYTES).toBe(25 * 1024 * 1024);
        expect(mail.MAIL_ZIP_TOTAL_MAX_BYTES).toBe(20 * 1024 * 1024);
        expect(mail.MAIL_OOXML_MAX_SLIDES).toBe(200);
        expect(mail.MAIL_XLSX_MAX_COLUMNS).toBe(256);
        expect(mail.MAIL_SUBJECT_MAX_CHARS).toBe(1000);
        expect(mail.MAIL_ADDRESSES_MAX_CHARS).toBe(2000);
        expect(mail.MAIL_INVITE_FIELD_MAX_CHARS).toBe(500);
        expect(mail.MAIL_INVITES_MAX).toBe(10);
    });

    it('keeps the internals internal', () => {
        expect(Object.keys(mail).sort()).toEqual([
            'MAIL_ADDRESSES_MAX_CHARS',
            'MAIL_ATTACHMENT_MAX_CHARS',
            'MAIL_BODY_MAX_CHARS',
            'MAIL_FETCH_MAX_BYTES',
            'MAIL_HTML_MAX_CHARS',
            'MAIL_INVITES_MAX',
            'MAIL_INVITE_FIELD_MAX_CHARS',
            'MAIL_OOXML_MAX_SLIDES',
            'MAIL_PDF_MAX_PAGES',
            'MAIL_REQUEST_ERROR_CODE',
            'MAIL_SEARCH_DATE_CANDIDATES',
            'MAIL_SEARCH_DEFAULT_LIMIT',
            'MAIL_SEARCH_MAX_LIMIT',
            'MAIL_SUBJECT_MAX_CHARS',
            'MAIL_THREAD_MAX_REFERENCES',
            'MAIL_TIMEOUT_MS',
            'MAIL_XLSX_MAX_COLUMNS',
            'MAIL_ZIP_PART_MAX_BYTES',
            'MAIL_ZIP_TOTAL_MAX_BYTES',
            'createMailClient',
            'encodeMailId',
            'injectMailContext',
            'mailTools',
            'parseMailId',
            'provideMailContext',
        ]);
    });

    it('exports the module, its name and variable, never the env helpers', () => {
        expect(module.MAIL_ACCOUNTS_VARIABLE).toBe('CHAMVI_MAIL_ACCOUNTS');
        expect(module.MAIL_CONNECTION_TYPE).toBe('mail');
        expect(module.TOOL_MAIL_MODULE_NAME).toBe('chamvi:tool-mail');
        expect(Object.keys(module).sort()).toEqual([
            'MAIL_ACCOUNTS_VARIABLE',
            'MAIL_CONNECTION_TYPE',
            'TOOL_MAIL_MODULE_NAME',
            'ToolMailModule',
            'toolMailModule',
        ]);
    });
});
