/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { LanguageModel, ToolSet } from 'ai';
import { afterEach } from 'vitest';
import { ValidationError } from '@chamvi/errors';
import { defineModelAgent } from '@chamvi/core';
import type {
    AgentLimits,
    ChannelMessage,
    IChannel,
    IEngine,
} from '@chamvi/core';
import { ControllableClock, createTestEngine } from '@chamvi/test-kit';
import { mailWriteTools, provideMailWriteContext } from '@chamvi/tool-mail';
import type { IMailWriteClient, MailWriteAccount, MailWriteToolsOptions } from '@chamvi/tool-mail';

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

afterEach(async () => {
    await Promise.all(engines.splice(0).map((engine) => engine.stop()));
});

/**
 * An engine with one agent `assistant` on `model`, the mail write tools over `client` or `accounts` (plus `tools`), and a
 * recording channel `chat` (`out` records, `fits` refuses a message body above `maxChars`, `direct` per `direct`, default true). The
 * client is also provided on the engine, and the classifier's timeout runs on the engine's clock.
 */
export function createWriteEngine(options: {
    /** The write client; else `accounts` give the tools a client of their own (nothing provided on the engine). */
    client?: IMailWriteClient;
    accounts?: MailWriteAccount[];
    /** `mailWriteTools({ deleteLimit })`. */
    deleteLimit?: MailWriteToolsOptions['deleteLimit'];
    model: LanguageModel;
    classifierModel?: LanguageModel;
    limits?: AgentLimits;
    maxChars?: number;
    tools?: ToolSet;
    /** The delete classifier's timeout on the engine's clock. */
    timeoutMs?: number;
    /** What the channel `chat` answers to `direct()` (default true). */
    direct?: boolean;
}): WriteEngine {
    const clock = new ControllableClock(new Date('2026-11-24T10:00:00Z'));
    const sent: WriteEngine['sent'] = [];
    const chat: IChannel = {
        name: 'chat',
        direct: () => options.direct ?? true,
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
                    ...(options.client ? { client: options.client } : { accounts: options.accounts! }),
                    clock,
                    ...(options.deleteLimit !== undefined && { deleteLimit: options.deleteLimit }),
                    ...(options.timeoutMs !== undefined && { timeoutMs: options.timeoutMs }),
                    ...(options.classifierModel && { classifier: { model: options.classifierModel } }),
                }),
            },
            ...(options.limits && { limits: options.limits }),
        })],
        channels: [chat],
        clock,
    });

    engines.push(engine);

    // the module's way: tools without a client of their own find it on the engine
    if (options.client) {
        provideMailWriteContext(engine, options.client);
    }

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
