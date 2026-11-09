/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    ApiError,
    IApiClient,
    RunWire,
    StepWire,
} from '@chamvi/ui-kit';

export type RunStreamEvent = { type: 'run'; run: RunWire } |
    { type: 'step'; step: StepWire } |
    {
        type: 'delta';
        step: number;
        kind: 'text' | 'reasoning';
        text: string;
    };

export type RunStreamOptions = {
    client: IApiClient;
    runId: string;
    /** Start after this step index (sent as `Last-Event-ID`). */
    after?: number;
    onEvent: (event: RunStreamEvent) => void;
    /** The run settled and its stream ended: no reconnect. */
    onSettled?: () => void;
    /** A 400, 401, 403 or 404: no reconnect. */
    onError?: (error: ApiError) => void;
    /** Waits between reconnects; resolves early (or rejects) when the signal aborts. */
    sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
};

export interface IRunStream {
    close(): void;
}
