/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { HttpAppOptions } from '@chamvi/http';
import type { App } from 'routup';
import { call } from './app.ts';
import type { CallOptions } from './app.ts';

/** Sends a request and reads its body to the end, so the metrics middleware has recorded it. */
export async function request(app: App, method: string, path: string, options: CallOptions = {}): Promise<Response> {
    const response = await call(app, method, path, options);

    await response.arrayBuffer();

    return response;
}

/** The distinct `path` labels the app's metrics endpoint reports, sorted. */
export async function pathLabels(app: App, metricsPath = '/metrics'): Promise<string[]> {
    const text = await (await call(app, 'GET', metricsPath)).text();
    const labels = new Set<string>();

    for (const match of text.matchAll(/path="([^"]*)"/g)) {
        labels.add(match[1]!);
    }

    return [...labels].sort();
}

type MetricsOptions = Exclude<HttpAppOptions['metrics'], false | undefined>;

/**
 * `metrics` options that record the `path` label of every timed request in
 * `labels`, in order; `skip` overrides the app's own (the streams).
 */
export function recordLabels(skip?: MetricsOptions['skip']): { metrics: MetricsOptions; labels: string[] } {
    const labels: string[] = [];

    return {
        labels,
        metrics: {
            ...(skip ? { skip } : {}),
            requestDurationLabelTransformer: (values) => {
                labels.push(String(values.path));
            },
        },
    };
}
