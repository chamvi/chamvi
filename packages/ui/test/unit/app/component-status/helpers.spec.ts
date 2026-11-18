/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import type { ComponentWire } from '@chamvi/ui-kit';
import {
    absoluteTime,
    componentState,
    componentSummary,
    isFailing,
    startsChannels,
} from '../../../../app/component-status/helpers.ts';
import { withoutIteratorHelpers } from '../../../utils/iterator.ts';

const EARLY = '2026-11-18T10:00:00.000Z';
const LATE = '2026-11-18T11:00:00.000Z';

const job = (input: Partial<ComponentWire> = {}): ComponentWire => ({
    name: 'store-purge',
    kind: 'job',
    ...input,
});

describe('componentState', () => {
    it('reads running while a pass is in flight, whatever the last pass did', () => {
        expect(componentState(job({ runningSince: LATE }))).toEqual({ label: 'running', tone: 'running' });
        expect(componentState(job({
            runningSince: LATE,
            lastErrorAt: LATE,
            lastSuccessAt: EARLY,
        }))).toEqual({ label: 'running', tone: 'running' });
    });

    it('reads idle, in the neutral tone, without any time', () => {
        expect(componentState(job())).toEqual({ label: 'idle', tone: 'queued' });
    });

    it('reads failing when the last error is newer than the last success, or there was no success', () => {
        expect(componentState(job({ lastSuccessAt: EARLY, lastErrorAt: LATE }))).toEqual({ label: 'failing', tone: 'failed' });
        expect(componentState(job({ lastErrorAt: EARLY, lastRunAt: EARLY }))).toEqual({ label: 'failing', tone: 'failed' });
    });

    it('reads healthy when the last success is the newer one or there was no error', () => {
        expect(componentState(job({ lastSuccessAt: LATE, lastErrorAt: EARLY }))).toEqual({ label: 'healthy', tone: 'completed' });
        expect(componentState(job({ lastSuccessAt: EARLY, lastRunAt: EARLY }))).toEqual({ label: 'healthy', tone: 'completed' });
        // only a last run, as a pass whose outcome the status does not name
        expect(componentState(job({ lastRunAt: EARLY }))).toEqual({ label: 'healthy', tone: 'completed' });
    });

    it('does not count an error at the same time as the success as failing', () => {
        expect(isFailing(job({ lastSuccessAt: EARLY, lastErrorAt: EARLY }))).toBe(false);
    });
});

describe('componentSummary', () => {
    it('counts jobs and channels, singular for one', () => {
        expect(componentSummary([
            job(),
            job({ name: 'agents-watcher' }),
            { name: 'cron', kind: 'channel' },
        ])).toBe('2 jobs · 1 channel');
        expect(componentSummary([job()])).toBe('1 job · 0 channels');
    });
});

describe('startsChannels', () => {
    it('marks only the first channel after a job', () => {
        const list: ComponentWire[] = [
            job(),
            { name: 'cron', kind: 'channel' },
            { name: 'github', kind: 'channel' },
        ];

        expect(list.map((_, index) => startsChannels(list, index))).toEqual([false, true, false]);
        expect(startsChannels([{ name: 'cron', kind: 'channel' }], 0)).toBe(false);
    });
});

describe('absoluteTime', () => {
    it('is the browser-local reading of the instant', () => {
        expect(absoluteTime(LATE)).toBe(new Date(LATE).toLocaleString());
    });
});

it('needs no iterator helpers (Safari before 18.4)', () => {
    const list: ComponentWire[] = [job({ lastErrorAt: LATE }), { name: 'cron', kind: 'channel' }];

    expect(withoutIteratorHelpers(() => [componentSummary(list), componentState(list[0]!).label])).toEqual(['1 job · 1 channel', 'failing']);
});
