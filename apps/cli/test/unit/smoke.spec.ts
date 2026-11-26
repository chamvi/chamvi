/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import * as cli from '@chamvi/cli';

describe('package entry', () => {
    it('resolves', () => {
        expect(cli).toBeDefined();
    });
});
