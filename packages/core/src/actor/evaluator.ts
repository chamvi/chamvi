/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IPermissionEvaluator, PermissionCompileResult } from '@authup/access';

/** The evaluator of the system actor: every check passes. */
export class SystemPermissionEvaluator implements IPermissionEvaluator {
    async evaluate(): Promise<void> {
        // every permission passes
    }

    async evaluateOneOf(): Promise<void> {
        // every permission passes
    }

    async preEvaluate(): Promise<void> {
        // every permission passes
    }

    async preEvaluateOneOf(): Promise<void> {
        // every permission passes
    }

    async compile(): Promise<PermissionCompileResult> {
        return { verdict: 'allow' };
    }
}
