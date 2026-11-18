/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Usage } from '@chamvi/store';
import type { DispatchEngineContext } from '../dispatch/types.ts';

/**
 * How the remote run of a stand-in ended (internal), recorded under
 * `remote-wait:<runId>`: the next execution settles the stand-in from it.
 * `timeout` is the stand-in's own deadline, not a remote status.
 */
export type RemoteOutcome = {
    status: 'completed' | 'failed' | 'cancelled' | 'timeout';
    output?: unknown;
    error?: { code: string; message: string };
    /** The remote run was tainted. */
    tainted: boolean;
    /** The remote run's usage, added to the stand-in's. */
    usage: Usage;
};

/** What `remote-start:<runId>` records (internal): the remote run the start created. */
export type RemoteStartRecord = {
    runId: string;
};

/** What answerRemoteWait() needs from the engine. */
export type RemoteEngineContext = Pick<DispatchEngineContext, 'runService' | 'resume'>;
