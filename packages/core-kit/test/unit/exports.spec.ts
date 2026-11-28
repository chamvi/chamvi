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
    it('exports exactly the run status, the stored order fields, the read normalizers, the domain rules and the validators', () => {
        expect(Object.keys(kit).sort()).toEqual([
            'AGENT_NAME_MAX_LENGTH',
            'AGENT_NAME_PATTERN',
            'APPROVAL_ID_MAX_LENGTH',
            'APPROVAL_OPTIONS_MAX',
            'APPROVAL_OPTION_ID_MAX_LENGTH',
            'APPROVAL_REASON_MAX_LENGTH',
            'ARTIFACT_MEDIA_TYPE_PATTERN',
            'ATTACHMENT_FILENAME_MAX_LENGTH',
            'AUTHORIZATION_CHECK_MAX_NAMES',
            'AUTHORIZATION_CHECK_NAME_MAX_LENGTH',
            'ApprovalValidator',
            'AuthorizationValidator',
            'BASE64_PATTERN',
            'CONNECTION_ACCOUNT_ID_MAX_LENGTH',
            'CONNECTION_GENERATION_MAX_LENGTH',
            'CONVERSATION_ITEM_STORED_ORDER',
            'ConnectionValidator',
            'DISPATCH_DEPTH_MAX',
            'MAX_ATTACHMENTS',
            'PEER_ORIGIN_MAX_LENGTH',
            'PeerStartValidator',
            'RECEIVED_MAX_LENGTH',
            'RunStatus',
            'RunValidator',
            'STEP_STORED_ORDER',
            'StateValidator',
            'TRIGGER_KEY_MAX_LENGTH',
            'ValidatorGroup',
            'boundReceived',
            'isAgentName',
            'isArtifactMediaType',
            'normalizeEnvelope',
            'normalizeWaitPoint',
        ]);
    });

    it('holds the domain rules', () => {
        expect(kit.AGENT_NAME_MAX_LENGTH).toBe(64);
        expect(kit.isAgentName('dev-ops')).toBe(true);
        expect(kit.isAgentName('Dev')).toBe(false);
        expect(kit.isAgentName('a'.repeat(65))).toBe(false);
        expect(kit.TRIGGER_KEY_MAX_LENGTH).toBe(255);
        expect(kit.DISPATCH_DEPTH_MAX).toBe(8);
        expect(kit.PEER_ORIGIN_MAX_LENGTH).toBe(128);
        expect(kit.APPROVAL_OPTIONS_MAX).toBe(20);
        expect(kit.RECEIVED_MAX_LENGTH).toBe(256);
        expect(kit.boundReceived('a'.repeat(254))).toBe('a'.repeat(254));
        expect(kit.boundReceived('a'.repeat(255))).toBeUndefined();
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
