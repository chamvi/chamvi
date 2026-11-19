/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { EngineEvent } from '../types.ts';
import type { EngineContext, EngineContextInput, EngineExecution } from './types.ts';

/** Builds the one context the parts of an engine share; called once per engine. */
export function createEngineContext(input: EngineContextInput): EngineContext {
    const executions = new Map<string, EngineExecution>();
    const deliveries = new Set<Promise<void>>();
    const deliveryControllers = new Set<AbortController>();
    const listeners = new Set<(e: EngineEvent) => void>();
    let lastCreatedAt = 0;

    return {
        ...input,
        executions,
        deliveries,
        deliveryControllers,
        provided: new Map(),
        listeners,
        emit: (event) => {
            for (const listener of listeners) {
                try {
                    listener(event);
                } catch (error) {
                    input.onError(error);
                }
            }
        },
        detach: (work, run) => {
            const controller = new AbortController();

            deliveryControllers.add(controller);

            const task: Promise<void> = Promise.try(() => work(controller.signal))
                .catch((error: unknown) => {
                    if (!input.isDraining() || !controller.signal.aborted) {
                        input.onError(error, run);
                    }
                })
                .finally(() => {
                    deliveryControllers.delete(controller);
                    deliveries.delete(task);
                });

            deliveries.add(task);
        },
        nextCreatedAt: () => {
            const t = Math.max(input.clock.now(), lastCreatedAt + 1);

            lastCreatedAt = t;

            return new Date(t);
        },
    };
}
