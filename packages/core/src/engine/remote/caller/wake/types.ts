/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Invoker } from '@chamvi/core-kit';
import type { WakeOutcome } from '../../../types.ts';

export interface IEngineRemoteWakes {
    /** Marks the remote wait of stand-in `runId` `wakeRequested` for the peer `invoker` authenticates as. */
    mark(runId: string, invoker: Invoker | undefined): Promise<WakeOutcome | undefined>;
    /** Takes the mark of a woken wait before its poll: false when it was taken already or the run moved on. */
    take(runId: string): Promise<boolean>;
}
