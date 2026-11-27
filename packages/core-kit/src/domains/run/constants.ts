/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export enum RunStatus {
    QUEUED = 'queued',
    RUNNING = 'running',
    WAITING = 'waiting',
    COMPLETED = 'completed',
    FAILED = 'failed',
    CANCELLED = 'cancelled',
    INTERRUPTED = 'interrupted',
}
