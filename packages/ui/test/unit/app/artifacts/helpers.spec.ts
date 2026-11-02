/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { approvalArtifactIds, isInlineImage } from '../../../../app/artifacts/helpers.ts';

describe('isInlineImage', () => {
    it.each(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])('shows %s inline', (type) => {
        expect(isInlineImage(type)).toBe(true);
    });

    it.each([
        'image/svg+xml',
        'application/pdf',
        'text/html',
        'image/png; charset=x',
        'IMAGE/PNG',
        '',
    ])('offers %s as a download', (type) => {
        expect(isInlineImage(type)).toBe(false);
    });
});

describe('approvalArtifactIds', () => {
    it('lists the request ids, then each option\'s, once each', () => {
        expect(approvalArtifactIds({
            artifacts: ['a', 'b'],
            options: [
                {
                    id: 'x',
                    label: 'X',
                    artifacts: ['c', 'a'],
                },
                { id: 'y', label: 'Y' },
                {
                    id: 'z',
                    label: 'Z',
                    artifacts: ['d'],
                },
            ],
        })).toEqual(['a', 'b', 'c', 'd']);
    });

    it('is empty for a plain wait point and none', () => {
        expect(approvalArtifactIds({})).toEqual([]);
        expect(approvalArtifactIds(undefined)).toEqual([]);
    });
});
