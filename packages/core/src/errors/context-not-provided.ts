/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError, ErrorCode } from '@chamvi/errors';

/**
 * inject() found no value for a context key. A tool error in `execute` and
 * the effect hooks; it fails the run when thrown in the tools factory.
 */
export class ContextNotProvidedError extends ChamviError {
    constructor(name: string) {
        super({
            message: `Context "${name}" is not provided: provide it on the engine (engine.provide), or add the module that does. ` +
                'A tool built by another copy of @chamvi/core or called outside a chamvi run has no context.',
            code: ErrorCode.CONTEXT_NOT_PROVIDED,
        });
    }
}
