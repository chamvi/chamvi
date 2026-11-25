/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import type { ToolLimit } from '@chamvi/core';
import { mockModel } from '@chamvi/test-kit';
import type { MockResponse } from '@chamvi/test-kit';
import {
    CALENDAR_CREATE_LIMIT_BUCKET,
    CALENDAR_CREATE_LIMIT_MAX,
    CALENDAR_CREATE_LIMIT_WINDOW_MS,
    calendarWriteTools,
    createCalendarWriteClient,
} from '@chamvi/tool-calendar';
import type { CalendarWriteToolsOptions } from '@chamvi/tool-calendar';
import { createFakeCalDav } from '../../utils/caldav.ts';
import type { FakeCalDav } from '../../utils/caldav.ts';
import { WRITE_ACCOUNT, createWriteEngine } from '../../utils/engine.ts';

const createCall = (input: unknown, toolCallId: string): MockResponse => ({
    parts: [{
        type: 'tool-call',
        toolName: 'calendar_create',
        input,
        toolCallId,
    }],
});

const done: MockResponse = { parts: [{ type: 'text', text: 'Done.' }] };

function plain(title: string) {
    return {
        calendar: 'icloud:home',
        title,
        start: '2026-11-05T09:00',
        end: '2026-11-05T10:00',
    };
}

const INVITE = { ...plain('Review'), attendees: ['a@example.com'] };

const INVITE_BODY = [
    'Calendar: Home (icloud:home)',
    'Title: Review',
    'When: 2026-11-05 09:00 to 2026-11-05 10:00 (Europe/Berlin)',
    'Attendees: a@example.com',
].join('\n');

const LIMIT_TITLE = /^Limit reached for calendar_create: .*Allow this call\?$/;

function fake(): FakeCalDav {
    return createFakeCalDav([{
        slug: 'home', 
        name: 'Home', 
        objects: [], 
    }]);
}

function puts(server: FakeCalDav): number {
    return server.requests.filter((request) => request.method === 'PUT').length;
}

function limitOf(createLimit?: CalendarWriteToolsOptions['createLimit']): ToolLimit | undefined {
    const client = createCalendarWriteClient([WRITE_ACCOUNT]);
    const tools = calendarWriteTools({ client, ...(createLimit !== undefined && { createLimit }) });

    return (tools.calendar_create as { limit?: ToolLimit }).limit;
}

describe('calendar_create\'s own limit', () => {
    it('has the defaults and takes createLimit', async () => {
        expect(limitOf()).toMatchObject({
            max: CALENDAR_CREATE_LIMIT_MAX,
            windowMs: CALENDAR_CREATE_LIMIT_WINDOW_MS,
            bucket: CALENDAR_CREATE_LIMIT_BUCKET,
            onExceed: 'approve',
        });
        expect(CALENDAR_CREATE_LIMIT_MAX).toBe(20);
        expect(CALENDAR_CREATE_LIMIT_WINDOW_MS).toBe(3_600_000);
        expect(CALENDAR_CREATE_LIMIT_BUCKET).toBe('creates');
        expect(await limitOf()!.weight!(INVITE, {} as never)).toBe(1);
        expect(limitOf({
            max: 5, 
            windowMs: 60_000, 
            bucket: 'calendar', 
        })).toMatchObject({
            max: 5, 
            windowMs: 60_000, 
            bucket: 'calendar', 
        });
        expect(limitOf(false)).toBeUndefined();
        expect(() => calendarWriteTools({ createLimit: 5 as never })).toThrow(InvalidAgentDefinitionError);
    });

    it('asks the limit approval with the create body, then creates', async () => {
        const server = fake();
        const write = createWriteEngine({
            fake: server,
            model: mockModel([createCall(plain('One'), 'c1'), createCall(plain('Two'), 'c2'), done]),
            createLimit: { max: 1 },
        });
        const runId = await write.dispatch();

        expect(puts(server)).toBe(1);
        expect(write.sent).toHaveLength(1);
        expect(write.sent[0]!.message.title).toMatch(LIMIT_TITLE);
        expect(write.sent[0]!.message.body).toBe([
            'Calendar: Home (icloud:home)',
            'Title: Two',
            'When: 2026-11-05 09:00 to 2026-11-05 10:00 (Europe/Berlin)',
        ].join('\n'));

        await write.answer(runId, true);

        expect(puts(server)).toBe(2);
        expect(write.sent).toHaveLength(1);
        expect((await write.run(runId))?.status).toBe('completed');
    });

    it.each([true, false])('over the limit with attendees asks one approval only (approved: %s)', async (approved) => {
        const server = fake();
        const write = createWriteEngine({
            fake: server,
            model: mockModel([createCall(plain('One'), 'c1'), createCall(INVITE, 'c2'), done]),
            createLimit: { max: 1 },
        });
        const runId = await write.dispatch();

        expect(write.sent).toHaveLength(1);
        expect(write.sent[0]!.message.title).toMatch(LIMIT_TITLE);
        expect(write.sent[0]!.message.body).toBe(INVITE_BODY);

        await write.answer(runId, approved);

        expect(puts(server)).toBe(approved ? 2 : 1);
        expect(write.sent).toHaveLength(1);
        expect((await write.run(runId))?.status).toBe('completed');
    });

    it('still asks the invitation after an agent limits entry, which shows no detail', async () => {
        const server = fake();
        const write = createWriteEngine({
            fake: server,
            model: mockModel([createCall(plain('One'), 'c1'), createCall(INVITE, 'c2'), done]),
            limits: { calendar_create: { max: 1, windowMs: 3_600_000 } },
        });
        const runId = await write.dispatch();

        expect(write.sent).toHaveLength(1);
        expect(write.sent[0]!.message.title).toMatch(LIMIT_TITLE);

        await write.answer(runId, true);

        expect(write.sent).toHaveLength(2);
        expect(write.sent[1]!.message).toMatchObject({ title: 'Create event in Home and invite 1?', body: INVITE_BODY });
        expect(puts(server)).toBe(1);

        await write.answer(runId, true);

        expect(puts(server)).toBe(2);
        expect((await write.run(runId))?.status).toBe('completed');
    });

    it('runs unlimited with createLimit: false', async () => {
        const server = fake();
        // one step of 21 calls: the step budget stays out of it
        const calls: MockResponse = { parts: Array.from({ length: 21 }, (_, index) => createCall(plain(`Event ${index}`), `c${index}`).parts).flat() };
        const write = createWriteEngine({
            fake: server, 
            model: mockModel([calls, done]), 
            createLimit: false, 
        });
        const runId = await write.dispatch();

        expect(puts(server)).toBe(21);
        expect(write.sent).toEqual([]);
        expect((await write.run(runId))?.status).toBe('completed');
    });
});
