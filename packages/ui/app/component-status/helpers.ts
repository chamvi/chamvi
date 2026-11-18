/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ComponentWire } from '@chamvi/ui-kit';
import type { ComponentState } from './types.ts';

const timeOf = (iso: string | undefined): number | undefined => {
    if (!iso) {
        return undefined;
    }

    const value = Date.parse(iso);

    return Number.isNaN(value) ? undefined : value;
};

/** Whether the last error is newer than the last success (or there was no success). */
export function isFailing(component: ComponentWire): boolean {
    const error = timeOf(component.lastErrorAt);

    if (error === undefined) {
        return false;
    }

    const success = timeOf(component.lastSuccessAt);

    return success === undefined || error > success;
}

/**
 * A pass in flight reads `running`; else no time at all `idle` (a job that
 * runs only when needed, a channel that has not fired yet: neutral, not a
 * warning); else the last error newer than the last success `failing`; else
 * `healthy`.
 */
export function componentState(component: ComponentWire): ComponentState {
    if (component.runningSince) {
        return { label: 'running', tone: 'running' };
    }

    if (!component.lastSuccessAt && !component.lastErrorAt && !component.lastRunAt) {
        return { label: 'idle', tone: 'queued' };
    }

    if (isFailing(component)) {
        return { label: 'failing', tone: 'failed' };
    }

    return { label: 'healthy', tone: 'completed' };
}

/** The absolute time in the browser's locale and zone, for a relative time's title. */
export function absoluteTime(iso: string): string {
    return new Date(iso).toLocaleString();
}

/** `4 jobs · 3 channels`. */
export function componentSummary(components: readonly ComponentWire[]): string {
    const jobs = components.filter((component) => component.kind === 'job').length;
    const channels = components.length - jobs;

    return `${jobs} ${jobs === 1 ? 'job' : 'jobs'} · ${channels} ${channels === 1 ? 'channel' : 'channels'}`;
}

/** The first channel after a job opens the channels with a stronger line. */
export function startsChannels(components: readonly ComponentWire[], index: number): boolean {
    return index > 0 && components[index]?.kind === 'channel' && components[index - 1]?.kind === 'job';
}
