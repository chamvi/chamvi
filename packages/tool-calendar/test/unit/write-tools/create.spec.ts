/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { wrapToolsForRun } from '@chamvi/core';
import { createTestEngine, mockModel } from '@chamvi/test-kit';
import type { MockResponse } from '@chamvi/test-kit';
import {
    calendarTools,
    calendarWriteTools,
    createCalendarClient,
    createCalendarWriteClient,
} from '@chamvi/tool-calendar';
import { encodeCalendarEventId } from '../../../src/event-id/module.ts';
import { calendarResourceOf } from '../../../src/write-client/create.ts';
import { calendarCreateKey } from '../../../src/write-tools/keys.ts';
import { createFakeCalDav, fakeObjectsOf } from '../../utils/caldav.ts';
import type { FakeCalDav } from '../../utils/caldav.ts';
import { WRITE_ACCOUNT, createWriteEngine } from '../../utils/engine.ts';
import { parseEvent, weeklyStandup } from '../../utils/ics.ts';
import { callTool, toolContext } from '../../utils/tools.ts';

const DESCRIPTION = 'Agenda:\n\t1. Budget\n2. Hiring';

const INPUT = {
    calendar: 'icloud:home',
    title: 'Planning',
    start: '2026-11-05T09:00',
    end: '2026-11-05T10:30',
    location: 'Room 1',
    description: DESCRIPTION,
    attendees: ['a@example.com', 'b@example.com', 'A@example.com'],
};

const PLAIN = {
    calendar: 'icloud:home',
    title: 'Focus time',
    start: '2026-11-05T09:00:00+01:00',
    end: '2026-11-05T11:00:00+01:00',
};

const BODY = [
    'Calendar: Home (icloud:home)',
    'From: peter@example.com',
    'Title: Planning',
    'When: 2026-11-05 09:00 to 2026-11-05 10:30 (Europe/Berlin)',
    'Where: Room 1',
    'Attendees: a@example.com, b@example.com',
    '--- description ---',
    DESCRIPTION,
].join('\n');

const createCall = (input: unknown, toolCallId = 'c1'): MockResponse => ({
    parts: [{
        type: 'tool-call',
        toolName: 'calendar_create',
        input,
        toolCallId,
    }],
});

const done: MockResponse = { parts: [{ type: 'text', text: 'Done.' }] };

function fake(): FakeCalDav {
    return createFakeCalDav([{
        slug: 'home', 
        name: 'Home', 
        objects: [weeklyStandup()], 
    }]);
}

function puts(server: FakeCalDav) {
    return server.requests.filter((request) => request.method === 'PUT');
}

describe('calendar_create', () => {
    it('creates an event without attendees with no approval', async () => {
        const server = fake();
        const write = createWriteEngine({ fake: server, model: mockModel([createCall(PLAIN), done]) });
        const runId = await write.dispatch();
        const [step] = await write.steps(runId);
        const { uid, name } = calendarResourceOf(calendarCreateKey(PLAIN, { run: { runId } }));

        expect(step?.error).toBeUndefined();
        expect(step?.output).toEqual({
            calendar: 'icloud:home',
            uid,
            event: encodeCalendarEventId({
                calendar: 'icloud:home', 
                name, 
                etag: '"w1"', 
            }),
            start: '2026-11-05T09:00:00+01:00',
            end: '2026-11-05T11:00:00+01:00',
            allDay: false,
            invited: 0,
        });
        expect(write.sent).toEqual([]);
        expect(await write.waiting(runId)).toBeUndefined();
        expect(puts(server)).toHaveLength(1);
    });

    it('asks the source chat with every attendee before inviting', async () => {
        const server = fake();
        const write = createWriteEngine({ fake: server, model: mockModel([createCall(INPUT), done]) });
        const runId = await write.dispatch();

        expect((await write.run(runId))?.status).toBe('waiting');
        expect(write.sent).toHaveLength(1);
        expect(write.sent[0]!.address).toBe('peter');
        expect(write.sent[0]!.message).toMatchObject({
            kind: 'approval',
            title: 'Create event in Home and invite 2?',
            body: BODY,
        });
        expect(puts(server)).toHaveLength(0);
    });

    it('creates once after the approval', async () => {
        const server = fake();
        const write = createWriteEngine({ fake: server, model: mockModel([createCall(INPUT), done]) });
        const runId = await write.dispatch();

        await write.answer(runId, true);

        const [step] = await write.steps(runId);
        const { uid, name } = calendarResourceOf(calendarCreateKey(INPUT, { run: { runId } }));

        expect((await write.run(runId))?.status).toBe('completed');
        expect(step?.output).toEqual({
            calendar: 'icloud:home',
            uid,
            event: encodeCalendarEventId({
                calendar: 'icloud:home', 
                name, 
                etag: '"w1"', 
            }),
            start: '2026-11-05T09:00:00+01:00',
            end: '2026-11-05T10:30:00+01:00',
            allDay: false,
            invited: 2,
        });
        expect(puts(server)).toHaveLength(1);

        const stored = fakeObjectsOf(server.calendars[0]!).find((object) => object.name === name)!;

        expect(parseEvent(stored.ics)).toMatchObject({
            uid,
            title: 'Planning',
            location: 'Room 1',
            description: DESCRIPTION,
            organizer: 'mailto:peter@example.com',
        });
        expect(parseEvent(stored.ics).attendees.map((attendee) => attendee.address)).toEqual(['mailto:a@example.com', 'mailto:b@example.com']);
        expect(write.sent).toHaveLength(1);
    });

    it('creates nothing when denied, naming the reason', async () => {
        const server = fake();
        const write = createWriteEngine({ fake: server, model: mockModel([createCall(INPUT), done]) });
        const runId = await write.dispatch();

        await write.answer(runId, false, 'später');

        const [step] = await write.steps(runId);

        expect(step?.error).toMatchObject({
            code: 'tool_denied',
            message: 'calendar_create: not approved; nothing was created. Reason: später',
        });
        expect(puts(server)).toHaveLength(0);
    });

    it('asks through the inbox only when the source address is no direct one', async () => {
        const server = fake();
        const write = createWriteEngine({
            fake: server, 
            model: mockModel([createCall(INPUT), done]), 
            direct: false, 
        });
        const runId = await write.dispatch();
        const waiting = await write.waiting(runId);

        expect(waiting?.title).toBe('Create event in Home and invite 2?');
        expect(waiting?.channel).toBeUndefined();
        expect(write.sent).toEqual([]);

        await write.answer(runId, true);

        expect(puts(server)).toHaveLength(1);
        expect((await write.run(runId))?.status).toBe('completed');
    });

    it('fails the call without waiting when the approval does not fit the chat', async () => {
        const server = fake();
        const write = createWriteEngine({
            fake: server,
            model: mockModel([createCall({ ...INPUT, description: 'x'.repeat(1500) }), done]),
            maxChars: 200,
        });
        const runId = await write.dispatch();
        const [step] = await write.steps(runId);

        expect((await write.run(runId))?.status).toBe('completed');
        expect(step?.error).toMatchObject({
            code: 'validation_error',
            message: expect.stringMatching(/^The message has \d+ characters; this chat takes 200\. .*invite fewer people and call calendar_create again; nothing was created\.$/),
        });
        expect(write.sent).toEqual([]);
        expect(puts(server)).toHaveLength(0);
    });

    it('refuses an account without a calendar address before asking', async () => {
        const server = fake();
        const write = createWriteEngine({
            client: createCalendarWriteClient([{ ...WRITE_ACCOUNT, user: 'peter' }], {
                fetch: server.fetch,
                timezone: 'Europe/Berlin',
            }),
            model: mockModel([createCall(INPUT), done]),
        });
        const runId = await write.dispatch();
        const [step] = await write.steps(runId);

        expect(step?.error).toMatchObject({
            code: 'validation_error',
            message: 'calendar_create: account "icloud" has no calendar address to invite from.',
        });
        expect(write.sent).toEqual([]);
        expect(puts(server)).toHaveLength(0);
    });

    it.each([
        ['a Cyrillic letter in an attendee', { attendees: ['pеter@example.com'] }],
        ['two addresses in one', { attendees: ['a@x.test, b@y.test'] }],
        ['a display name', { attendees: ['Eve <e@x.test>'] }],
        ['a header break in the title', { title: 'Hi\r\nAttendees: none' }],
        ['a bidi override in the location', { location: 'Room ‮1' }],
        ['a zero-width space in the title', { title: 'Plan\u{200B}ning' }],
        ['a CR in the description', { description: 'one\rtwo' }],
        ['a bidi isolate in the description', { description: 'a ⁦b⁩' }],
        ['a title of 501 characters', { title: 't'.repeat(501) }],
        ['a description of 2001 characters', { description: 'd'.repeat(2001) }],
        ['a plain date without allDay', { start: '2026-11-05', end: '2026-11-06' }],
        ['a date-time with allDay', {
            start: '2026-11-05T09:00', 
            end: '2026-11-06T09:00', 
            allDay: true, 
        }],
        ['end before start', { start: '2026-11-05T10:00', end: '2026-11-05T09:00' }],
        ['367 days', { start: '2026-11-05T09:00', end: '2027-11-07T09:00' }],
        ['51 attendees', { attendees: Array.from({ length: 51 }, (_, index) => `a${index}@example.com`) }],
        ['no attendee in the list', { attendees: [] }],
        ['an unknown calendar', { calendar: 'icloud:work' }],
    ])('refuses %s before asking', async (_, change) => {
        const server = fake();
        const write = createWriteEngine({ fake: server, model: mockModel([createCall({ ...INPUT, ...change }), done]) });
        const runId = await write.dispatch();
        const [step] = await write.steps(runId);

        expect(step?.error).toMatchObject({ code: 'validation_error' });
        expect(write.sent).toEqual([]);
        expect(await write.waiting(runId)).toBeUndefined();
        expect(puts(server)).toHaveLength(0);
    });

    it('takes all-day dates with an exclusive end', async () => {
        const server = fake();
        const write = createWriteEngine({
            fake: server,
            model: mockModel([createCall({
                ...INPUT,
                start: '2026-11-05',
                end: '2026-11-07',
                allDay: true,
                location: undefined,
                description: undefined,
                attendees: ['a@example.com'],
            }), done]),
        });
        const runId = await write.dispatch();

        expect(write.sent[0]!.message.body).toBe([
            'Calendar: Home (icloud:home)',
            'From: peter@example.com',
            'Title: Planning',
            'When: 2026-11-05 to 2026-11-06, all day',
            'Attendees: a@example.com',
        ].join('\n'));

        await write.answer(runId, true);

        const [step] = await write.steps(runId);

        expect(step?.output).toMatchObject({
            start: '2026-11-05', 
            end: '2026-11-07', 
            allDay: true, 
        });
    });

    it('still creates in a run calendar_events tainted, asking only for invitations', async () => {
        const server = fake();
        const reader = createCalendarClient([WRITE_ACCOUNT], { fetch: server.fetch });
        const write = createWriteEngine({
            fake: server,
            model: mockModel([
                {
                    parts: [{
                        type: 'tool-call',
                        toolName: 'calendar_events',
                        input: { from: '2026-11-02', to: '2026-11-17' },
                        toolCallId: 'r1',
                    }],
                },
                createCall(PLAIN, 'c2'),
                done,
            ]),
            tools: calendarTools({ client: reader }),
        });
        const runId = await write.dispatch();
        const [step] = await write.steps(runId);

        expect((await write.run(runId))?.taint).toBeDefined();
        expect(step?.error).toBeUndefined();
        expect(write.sent).toEqual([]);
        expect(puts(server)).toHaveLength(1);
    });

    it('a replay without the effect record finds the created event: no second approval or PUT', async () => {
        const server = fake();
        const write = createWriteEngine({ fake: server, model: mockModel([createCall(INPUT), done]) });
        const runId = await write.dispatch();

        await write.answer(runId, true);

        const [step] = await write.steps(runId);

        expect(puts(server)).toHaveLength(1);

        // the effect record never landed: a fresh effect store
        const { effectService } = createTestEngine({ agents: [] });
        const ctx = toolContext(undefined, undefined, runId);
        const own = calendarWriteTools({ client: write.client!, createLimit: false });
        const tools = wrapToolsForRun({ calendar_create: own.calendar_create! }, ctx, effectService);
        const result = await callTool(tools, 'calendar_create', INPUT, ctx);

        expect(result).toEqual(step?.output);
        expect(puts(server)).toHaveLength(1);
        expect(write.sent).toHaveLength(1);
    });
});
