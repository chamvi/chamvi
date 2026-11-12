/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { expect, it } from 'vitest';
import { overlaps } from '../../../src/prepare/tree.ts';

it.each([
    ['skills/foo', 'skills/foo', true],
    ['skills/foo/vendor', 'skills/foo', true],
    ['skills', 'skills/foo', true],
    ['vendor/x', 'skills/foo', false],
    ['skills/foobar', 'skills/foo', false],
    ['Skills/foo/vendor', 'skills/foo', true],
    ['.Claude/skills/foo', '.claude/skills/foo', true],
    ['skills/Föo', 'skills/föo', true],
    ['vendor/x', '.', true],
])('gitlink %s overlaps skill %s: %s', (link, skill, expected) => {
    expect(overlaps(link, skill)).toBe(expected);
});
