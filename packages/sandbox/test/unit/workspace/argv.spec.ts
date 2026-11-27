/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { ValidationError } from '@chamvi/errors';
import { assertArgv } from '@chamvi/sandbox';

describe('assertArgv', () => {
    it('accepts a command with arguments', () => {
        expect(() => assertArgv(['git', 'status', ''])).not.toThrow();
    });

    it.each([
        [[]],
        [['']],
        [['echo', 'a\0b']],
        [['echo', 1 as unknown as string]],
        ['echo' as unknown as string[]],
    ])('refuses %j', (argv) => {
        expect(() => assertArgv(argv)).toThrow(ValidationError);
    });
});
