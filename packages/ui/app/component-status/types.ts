/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** A `.chip` tone of the shell's stylesheet. */
export type ComponentTone = 'running' | 'failed' | 'completed' | 'queued';

/** What the status column shows for a component. */
export type ComponentState = {
    label: 'running' | 'failing' | 'healthy' | 'idle';
    tone: ComponentTone;
};

export type ComponentTimeKey = 'lastSuccessAt' | 'lastErrorAt' | 'lastRunAt' | 'runningSince';
