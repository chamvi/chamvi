/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import * as cli from '@chamvi/cli';

describe('exports', () => {
    it('pins the public runtime exports', () => {
        expect(Object.keys(cli).sort()).toEqual([
            'CLI_USAGE_ERROR_CODE',
            'EXIT_CODE',
            'runCli',
        ]);
    });

    it('EXIT_CODE', () => {
        expect(cli.EXIT_CODE).toEqual({
            OK: 0,
            FAILURE: 1,
            USAGE: 2,
        });
    });

    it('CLI_USAGE_ERROR_CODE', () => {
        expect(cli.CLI_USAGE_ERROR_CODE).toBe('cli_usage');
    });

    it('runCli', () => {
        expect(typeof cli.runCli).toBe('function');
    });
});
