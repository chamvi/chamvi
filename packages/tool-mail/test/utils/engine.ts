/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { LanguageModel, ToolSet } from 'ai';
import { afterEach } from 'vitest';
import { ValidationError, defineModelAgent } from '@chamvi/core';
import type {
    AgentLimits,
    ChannelMessage,
    IChannel,
    IEngine,
} from '@chamvi/core';
import { ControllableClock, createTestEngine } from '@chamvi/test-kit';
import { mailWriteTools } from '@chamvi/tool-mail';
import type { IMailWriteClient } from '@chamvi/tool-mail';

type Run = Awaited<ReturnType<IEngine['runService']['findOne']>>;
type Step = Awaited<ReturnType<IEngine['stepService']['find']>>[number];
type ApprovalWaitPoint = Extract<NonNullable<NonNullable<Run>['waiting']>, { kind: 'approval' }>;

export type WriteEngine = {
    engine: IEngine;
    clock: ControllableClock;
    /** What the recording channel `chat` was sent, in order. */
    sent: { message: ChannelMessage; address: string }[];
    /** Dispatches a run of `assistant` from `channel` (default `chat`, address `peter`) and waits until it settled or paused. */
    dispatch: (channel?: string) => Promise<string>;
    run: (runId: string) => Promise<Run>;
    /** The run's approval wait point, if it waits on one. */
    waiting: (runId: string) => Promise<ApprovalWaitPoint | undefined>;
    /** Answers the run's pending approval and waits until the engine settled. */
    answer: (runId: string, approved: boolean, reason?: string) => Promise<void>;
    /** The run's tool steps of `name`, in order. */
    steps: (runId: string, name?: string) => Promise<Step[]>;
};

const engines: IEngine[] = [];

afterEach(() => {
    for (const engine of engines.splice(0)) {
        engine.stop();
    }
});

/**
 * An engine with one agent `assistant` on `model`, the mail write tools over `client` (plus `tools`), and a
 * recording channel `chat` (`out` records, `fits` refuses a message body above `maxChars`, `direct` true).
 */
export function createWriteEngine(options: {
    client: IMailWriteClient;
    model: LanguageModel;
    classifierModel?: LanguageModel;
    limits?: AgentLimits;
    maxChars?: number;
    tools?: ToolSet;
}): WriteEngine {
    const clock = new ControllableClock(new Date('2026-11-24T10:00:00Z'));
    const sent: WriteEngine['sent'] = [];
    const chat: IChannel = {
        name: 'chat',
        direct: () => true,
        fits(message) {
            if (options.maxChars !== undefined && (message.body ?? '').length > options.maxChars) {
                throw new ValidationError(`The message has ${(message.body ?? '').length} characters; this chat takes ${options.maxChars}.`);
            }
        },
        async out(message, address) {
            sent.push({ message, address });
        },
    };
    const engine = createTestEngine({
        agents: [defineModelAgent({
            name: 'assistant',
            instructions: 'You write mail.',
            model: options.model,
            tools: {
                ...options.tools,
                ...mailWriteTools({
                    client: options.client,
                    ...(options.classifierModel && { classifier: { model: options.classifierModel } }),
                }),
            },
            ...(options.limits && { limits: options.limits }),
        })],
        channels: [chat],
        clock,
    });

    engines.push(engine);

    let started = false;
    const waiting = async (runId: string) => {
        const run = await engine.runService.findOne(runId);

        return run?.waiting?.kind === 'approval' ? run.waiting : undefined;
    };

    return {
        engine,
        clock,
        sent,
        dispatch: async (channel = 'chat') => {
            if (!started) {
                started = true;
                await engine.start();
            }

            const { runId } = await engine.dispatch({
                agent: 'assistant',
                trigger: channel,
                channel,
                payload: {},
                address: 'peter',
            });

            await engine.idle();

            return runId;
        },
        run: (runId) => engine.runService.findOne(runId),
        waiting,
        answer: async (runId, approved, reason) => {
            const point = await waiting(runId);

            if (!point) {
                throw new Error(`run ${runId} waits on no approval`);
            }

            await engine.approve(runId, {
                approvalId: point.approvalId,
                approved,
                ...(reason !== undefined && { reason }),
            });
            await engine.idle();
        },
        steps: async (runId, name = 'mail_send') => (await engine.stepService.find(runId))
            .filter((step) => step.kind === 'tool' && step.name === name),
    };
}
