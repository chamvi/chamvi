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
import { calendarWriteTools, createCalendarWriteClient, provideCalendarWriteContext } from '@chamvi/tool-calendar';
import type { CalendarAccount, CalendarWriteToolsOptions, ICalendarWriteClient } from '@chamvi/tool-calendar';
import { FAKE_CALDAV_URL } from './caldav.ts';
import type { FakeCalDav } from './caldav.ts';

type Run = Awaited<ReturnType<IEngine['runService']['findOne']>>;
type Step = Awaited<ReturnType<IEngine['stepService']['find']>>[number];
type ApprovalWaitPoint = Extract<NonNullable<NonNullable<Run>['waiting']>, { kind: 'approval' }>;

/** The account the write engine's fake-backed client writes as. */
export const WRITE_ACCOUNT: CalendarAccount = {
    id: 'icloud',
    url: FAKE_CALDAV_URL,
    user: 'peter@example.com',
    password: 'secret',
};

export type WriteEngine = {
    engine: IEngine;
    clock: ControllableClock;
    /** The client the tools use (provided on the engine), when one was given or built from `fake`. */
    client?: ICalendarWriteClient;
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
 * An engine with one agent `assistant` on `model`, the calendar write tools
 * (plus `tools`) and a recording channel `chat` (`out` records, `fits`
 * refuses a body above `maxChars`, `direct` per `direct`, default true). With
 * `fake` a client of `WRITE_ACCOUNT` over it (zone Europe/Berlin, the
 * engine's clock) is provided on the engine; with `client` that one; with
 * `accounts` the tools build their own.
 */
export function createWriteEngine(options: {
    fake?: FakeCalDav;
    client?: ICalendarWriteClient;
    accounts?: CalendarAccount[];
    model: LanguageModel;
    classifierModel?: LanguageModel;
    limits?: AgentLimits;
    createLimit?: CalendarWriteToolsOptions['createLimit'];
    deleteLimit?: CalendarWriteToolsOptions['deleteLimit'];
    maxChars?: number;
    tools?: ToolSet;
    timeoutMs?: number;
    direct?: boolean;
}): WriteEngine {
    const clock = new ControllableClock(new Date('2026-11-01T10:00:00Z'));
    const sent: WriteEngine['sent'] = [];
    const client = options.client ?? (options.fake ?
        createCalendarWriteClient([WRITE_ACCOUNT], {
            fetch: options.fake.fetch, 
            clock, 
            timezone: 'Europe/Berlin', 
        }) :
        undefined);
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
            instructions: 'You keep the calendar.',
            model: options.model,
            tools: {
                ...options.tools,
                ...calendarWriteTools({
                    ...(options.accounts && { accounts: options.accounts }),
                    clock,
                    ...(options.createLimit !== undefined && { createLimit: options.createLimit }),
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
    if (client) {
        provideCalendarWriteContext(engine, client);
    }

    let started = false;
    const waiting = async (runId: string) => {
        const run = await engine.runService.findOne(runId);

        return run?.waiting?.kind === 'approval' ? run.waiting : undefined;
    };

    return {
        engine,
        clock,
        ...(client && { client }),
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
        steps: async (runId, name = 'calendar_create') => (await engine.stepService.find(runId))
            .filter((step) => step.kind === 'tool' && step.name === name),
    };
}
