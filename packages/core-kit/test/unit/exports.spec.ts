/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as kit from '@chamvi/core-kit';

const SRC = fileURLToPath(new URL('../../src/', import.meta.url));

describe('public api', () => {
    it('exports exactly the run status, the stored order fields and the read normalizers', () => {
        expect(Object.keys(kit).sort()).toEqual([
            'CONVERSATION_ITEM_STORED_ORDER',
            'RunStatus',
            'STEP_STORED_ORDER',
            'normalizeEnvelope',
            'normalizeWaitPoint',
        ]);
    });

    it('reads legacy stored shapes back in the current shape', () => {
        expect(kit.normalizeWaitPoint({ kind: 'approval', approvalId: '1:c:0' })).toEqual({
            kind: 'approval',
            approvalId: '1:c:0',
            id: '1:c:0',
        });
        expect(kit.normalizeWaitPoint({ kind: 'dispatch', id: '1:c:w0' })).toEqual({ kind: 'dispatch', id: '1:c:w0' });
    });

    it('stays browser-safe: no node built-in and no @chamvi package beyond errors and access', () => {
        const files = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
            .filter((file) => file.endsWith('.ts'));

        expect(files.length).toBeGreaterThan(0);

        for (const file of files) {
            const content = readFileSync(`${SRC}${file}`, 'utf8');
            const specifiers = content
                .matchAll(/(?:from|import|require)\s*\(?\s*'([^']+)'/g)
                .map((match) => match[1] ?? '')
                .toArray();

            for (const specifier of specifiers) {
                expect(specifier.startsWith('node:'), `${file} imports ${specifier}`).toBe(false);

                if (specifier.startsWith('@chamvi/')) {
                    expect(['@chamvi/access', '@chamvi/errors'], `${file} imports ${specifier}`).toContain(specifier);
                }
            }
        }
    });
});
