/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { isPagePath, safeReturnPath } from '../../../src/auth/helpers.ts';

const UI_BASE = '/api/ui';

describe('safeReturnPath', () => {
    it('keeps a dashboard path', () => {
        expect(safeReturnPath('/approvals?run=1', '/', UI_BASE)).toBe('/approvals?run=1');
    });

    it('keeps a page under the ui base', () => {
        expect(safeReturnPath('/api/ui/ext/tool-mail?a=1#b', '/', UI_BASE)).toBe('/api/ui/ext/tool-mail?a=1#b');
    });

    it.each([
        ['an absolute url', 'https://evil.example/api/ui/ext/mail'],
        ['a protocol-relative url', '//evil.example/api/ui/ext/mail'],
        ['a backslash', '/api/ui/ext/mail\\..\\..\\x'],
        ['a path that climbs out', '/api/ui/ext/../../x'],
        ['an encoded climb', '/api/ui/ext/%2e%2e/x'],
        ['an encoded separator', '/api/ui/ext/a%2F..%2F..%2Fx'],
        ['a control character', '/api/ui/ext/.\t./x'],
        ['an undecodable segment', '/api/ui/ext/%E0%A4%A'],
    ])('refuses %s', (_name, path) => {
        expect(safeReturnPath(path, '/', UI_BASE)).toBe('/');
    });

    it('falls back on a non-string', () => {
        expect(safeReturnPath(['/a'], '/x', UI_BASE)).toBe('/x');
    });
});

describe('isPagePath', () => {
    it('recognizes a page under the ui base', () => {
        expect(isPagePath('/api/ui/ext/tool-mail', UI_BASE)).toBe(true);
        expect(isPagePath('/api/ui/ext/tool-mail/accounts?a=1', UI_BASE)).toBe(true);
    });

    it.each([
        ['a dashboard path', '/approvals'],
        ['the ext folder alone', '/api/ui/ext/'],
        ['another page base', '/api/uix/ext/mail'],
        ['an unrelated path', '/metrics'],
        ['a path that climbs out', '/api/ui/ext/mail/../../..'],
    ])('leaves %s to the router', (_name, path) => {
        expect(isPagePath(path, UI_BASE)).toBe(false);
    });
});
