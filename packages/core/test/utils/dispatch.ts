/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { MockLanguageModelV4 } from 'ai/test';
import type { IEngine, Run } from '@chamvi/core';
import { mockModel } from './mock-model.ts';
import type { MockResponse } from './mock-model.ts';

/** A parent turn: a fixed response, or one built when the model is called (it may wait). */
export type ParentTurn = MockResponse | ((options: LanguageModelV4CallOptions) => MockResponse | Promise<MockResponse>);

/** A dispatched run's model call: its response for the payload (throw or reject to fail the run). */
export type ChildTurn = (payload: unknown, options: LanguageModelV4CallOptions) => MockResponse | Promise<MockResponse>;

/** The rendered trigger of the run's first user message (`channel`, `trigger`, `payload`). */
export function triggerOf(options: LanguageModelV4CallOptions): { channel?: string; payload?: unknown } | undefined {
    const first = options.prompt.find((m) => m.role === 'user');

    if (!first || typeof first.content === 'string') {
        return undefined;
    }

    for (const part of first.content) {
        if (part.type !== 'text') {
            continue;
        }

        const match = /```json\n([\s\S]*)\n```/.exec(part.text);

        if (match) {
            return JSON.parse(match[1]!) as { channel?: string; payload?: unknown };
        }
    }

    return undefined;
}

/** True when a tool message of the prompt holds `text`. */
export function promptHas(options: LanguageModelV4CallOptions, text: string): boolean {
    return JSON.stringify(options.prompt.filter((m) => m.role === 'tool')).includes(text);
}

/**
 * One model for a parent and its dispatched runs: a run of channel `agent`
 * gets `child(payload)`, every other run the next of `parent`.
 */
export function treeModel(parent: ParentTurn[], child: ChildTurn) {
    let turn = 0;

    return new MockLanguageModelV4({
        doStream: async (options) => {
            const trigger = triggerOf(options);

            if (trigger?.channel === 'agent') {
                return mockModel([await child(trigger.payload, options)]).doStream(options);
            }

            const next = parent[turn++];

            if (!next) {
                throw new Error('mock script exhausted');
            }

            const response = typeof next === 'function' ? await next(options) : next;

            return mockModel([response]).doStream(options);
        },
    });
}

/** Resolves with the first run `run.updated` reports that matches, from now on. */
export function nextRun(engine: IEngine, match: (run: Run) => boolean): Promise<Run> {
    const { promise, resolve } = Promise.withResolvers<Run>();
    const off = engine.on('run.updated', ({ run }) => {
        if (!match(run)) {
            return;
        }

        off();
        resolve(run);
    });

    return promise;
}

/** A gate a child's model call awaits: `open()` lets it answer. */
export function gate() {
    const { promise, resolve } = Promise.withResolvers<void>();

    return { wait: () => promise, open: () => resolve() };
}
