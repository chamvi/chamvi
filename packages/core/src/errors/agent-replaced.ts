/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError } from './base.ts';
import { ErrorCode } from './constants.ts';

/** dispatch() refused: the registry holds another object for the agent than the one the caller checked. */
export class AgentReplacedError extends ChamviError {
    constructor(name: string) {
        super({ message: `Agent "${name}" was replaced since it was checked.`, code: ErrorCode.AGENT_REPLACED });
    }
}
