/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Run } from '@chamvi/store';
import type { Agent } from '../../agent/types.ts';
import type { EngineContext } from '../context/types.ts';
import type { CancelReason, EngineRegistryState } from '../registry/types.ts';
import type { IEngineSkills } from '../skills/types.ts';

/** Which queued runs may start on this engine (internal). */
export interface IEngineStartGuard {
    /** Cancels of queued runs stamped with a replaced revision, by run id; idle() waits for them. */
    readonly staleCancels: Map<string, Promise<void>>;
    prepareStart(): Promise<(run: Run) => boolean>;
    pruneCheckedRuns(): (queued: readonly Run[]) => void;
    replacedSince(run: Run): boolean;
    isStale(run: Run, revision: string): boolean;
    cancelStale(run: Run, revision: string | undefined): void;
    isCurrent(name: string): Promise<boolean>;
}

/** What EngineStartGuard needs from the engine (internal). */
export type EngineStartGuardContext = Pick<EngineContext, 'agentRevisionService' | 'onError' | 'isStarted'> & {
    /** The live registry, read by reference. */
    registry: Pick<EngineRegistryState, 'agents' | 'revisions' | 'formerRevisions' | 'syncing'>;
    skills: IEngineSkills;
    /** The checked-run fence, by run id (shared with intake and cancel). */
    checkedRuns: Map<string, Agent>;
    /** Whether a start() in flight was aborted. */
    isStartAborted(): boolean;
    /** The engine's cancelRun() (a subclass may wrap it). */
    cancelRun(runId: string, reason?: CancelReason): Promise<void>;
};
