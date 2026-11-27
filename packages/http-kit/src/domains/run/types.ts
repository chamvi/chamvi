/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { 
    PeerRunView, 
    RunStatusLiteral, 
    RunView, 
    Step, 
} from '@chamvi/core-kit';
import type { EntityQueryInput } from '../../helpers/types.ts';
import type { APIRequestOptions, Wire } from '../types.ts';

export type RunWire = Wire<RunView>;

export type StepWire = Wire<Step>;

export type RunDetail = RunWire & { steps: StepWire[] };

/** `GET /runs/:id` as a peer principal reads a run it started. */
export type PeerRunViewWire = Wire<PeerRunView>;

export type RunPage = {
    data: RunWire[];
    meta: {
        total: number;
        limit: number;
        offset: number
    };
};

/** The fields `GET /runs` filters and sorts by: `parent` is the dispatching run, `waiting` the kind of wait point. */
export type RunListFields = {
    agent: string;
    parent: string;
    status: RunStatusLiteral;
    waiting: 'approval' | 'dispatch';
    createdAt: string;
};

export type RunListQuery = EntityQueryInput<RunListFields>;

export type ApproveBody = {
    approvalId: string;
    approved: boolean;
    reason?: string;
    selected?: string[]
};

export type RunStreamInit = {
    /** Resumes after this event id (`Last-Event-ID`). */
    lastEventId?: number;
    signal: AbortSignal;
};

export interface IRunAPI {
    /** `GET /runs`, newest first unless the query sorts. */
    getMany(query?: RunListQuery, options?: APIRequestOptions): Promise<RunPage>;
    getOne(id: string, options?: APIRequestOptions): Promise<RunDetail>;
    /** `GET /runs/:id` answered to a peer principal: the narrow view of a run it started. */
    getPeerView(id: string, options?: APIRequestOptions): Promise<PeerRunViewWire>;
    cancel(id: string, options?: APIRequestOptions): Promise<void>;
    /** `POST /runs/:id/wake`: the content-free ping that a peer's stand-in run should poll now. */
    wake(id: string, options?: APIRequestOptions): Promise<void>;
    approve(id: string, body: ApproveBody, options?: APIRequestOptions): Promise<void>;
    /** The `text/event-stream` body of `GET /runs/:id/stream` (an ApiError for a non-2xx answer). */
    stream(id: string, init: RunStreamInit): Promise<ReadableStream<Uint8Array>>;
}
