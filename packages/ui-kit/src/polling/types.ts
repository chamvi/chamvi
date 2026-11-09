/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export type PollerTimers = { set: typeof setTimeout; clear: typeof clearTimeout };

/** Whether the page is hidden (a background tab), and a subscription to changes. */
export interface IPageVisibility {
    hidden(): boolean;
    /** Calls `fn` on every change; returns the unsubscribe. */
    onChange(fn: () => void): () => void;
}

export interface IPoller {
    start(): void;
    stop(): void;
    /** Runs now (after a run in flight), then polls on from there. */
    refresh(): Promise<void>;
}
