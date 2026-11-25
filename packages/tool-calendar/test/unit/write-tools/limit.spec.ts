/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { jsonSchema } from 'ai';
import { InvalidAgentDefinitionError, defineTool, once } from '@chamvi/core';
import type { ToolLimit } from '@chamvi/core';
import { mockModel } from '@chamvi/test-kit';
import type { MockResponse } from '@chamvi/test-kit';
import {
    CALENDAR_CREATE_LIMIT_BUCKET,
    CALENDAR_CREATE_LIMIT_MAX,
    CALENDAR_CREATE_LIMIT_WINDOW_MS,
    CALENDAR_DELETE_LIMIT_BUCKET,
    CALENDAR_DELETE_LIMIT_MAX,
    CALENDAR_DELETE_LIMIT_WINDOW_MS,
    calendarWriteTools,
    createCalendarWriteClient,
} from '@chamvi/tool-calendar';
import type { CalendarWriteToolsOptions, ICalendarWriteClient } from '@chamvi/tool-calendar';
import { encodeCalendarEventId } from '../../../src/event-id/module.ts';
import { createFakeCalDav, fakeObjectsOf } from '../../utils/caldav.ts';
import type { FakeCalDav, FakeObject } from '../../utils/caldav.ts';
import { calendar, vevent } from '../../utils/ics.ts';
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
    'From: peter@example.com',
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

function past(name: string): FakeObject {
    return {
        name,
        etag: `"${name}"`,
        ics: calendar(vevent(
            `UID:${name}`,
            'DTSTART:20261020T080000Z',
            'DTEND:20261020T090000Z',
            `SUMMARY:Old ${name}`,
        )),
    };
}

const ONE = past('one.ics');
const TWO = past('two.ics');

function eventOf(item: FakeObject): string {
    return encodeCalendarEventId({
        calendar: 'icloud:home', 
        name: item.name, 
        etag: item.etag, 
    });
}

const deleteCall = (item: FakeObject, toolCallId: string): MockResponse => ({
    parts: [{
        type: 'tool-call',
        toolName: 'calendar_delete',
        input: { event: eventOf(item) },
        toolCallId,
    }],
});

const decision = (value: string): MockResponse => ({ parts: [{ type: 'text', text: JSON.stringify({ decision: value }) }] });

const TWO_LINE = '2026-10-20 10:00 to 2026-10-20 11:00 (Europe/Berlin) | Old two.ics | no attendees | Home';

function deleteFake(): FakeCalDav {
    return createFakeCalDav([{
        slug: 'home', 
        name: 'Home', 
        objects: [ONE, TWO], 
    }]);
}

function kept(server: FakeCalDav): string[] {
    return fakeObjectsOf(server.calendars[0]!).map((item) => item.name);
}

/** `client` whose `failing`-th `describe` fails (a transient error), the rest as given. */
function flakyDescribe(client: ICalendarWriteClient, failing: number): ICalendarWriteClient {
    let calls = 0;

    return {
        timezone: client.timezone,
        clock: client.clock,
        calendar: (id, signal) => client.calendar(id, signal),
        organizer: (account, signal) => client.organizer(account, signal),
        create: (request, signal) => client.create(request, signal),
        findCreated: (id, key, signal) => client.findCreated(id, key, signal),
        describe: async (event, signal) => {
            calls++;

            if (calls === failing) {
                throw new Error('connection reset');
            }

            return client.describe(event, signal);
        },
        remove: (event, signal) => client.remove(event, signal),
        close: () => client.close(),
    };
}

const DELETE_LIMIT_TITLE = /^Limit reached for calendar_delete: .*Allow this call\?$/;

describe('calendar_delete\'s own limit', () => {
    it('has the defaults of mail_delete and takes deleteLimit', () => {
        const client = createCalendarWriteClient([WRITE_ACCOUNT]);
        const { limit } = (calendarWriteTools({ client }).calendar_delete as { limit?: ToolLimit });

        // equal to tool-mail's MAIL_DELETE_LIMIT_MAX, MAIL_DELETE_LIMIT_WINDOW_MS and MAIL_DELETE_LIMIT_BUCKET: the bucket is shared
        expect(CALENDAR_DELETE_LIMIT_MAX).toBe(20);
        expect(CALENDAR_DELETE_LIMIT_WINDOW_MS).toBe(3_600_000);
        expect(CALENDAR_DELETE_LIMIT_BUCKET).toBe('deletes');
        expect(limit).toMatchObject({
            max: 20, 
            windowMs: 3_600_000, 
            bucket: 'deletes', 
            onExceed: 'approve', 
        });
        expect((calendarWriteTools({ client, deleteLimit: { max: 5 } }).calendar_delete as { limit?: ToolLimit }).limit).toMatchObject({ max: 5 });
        expect((calendarWriteTools({ client, deleteLimit: false }).calendar_delete as { limit?: ToolLimit }).limit).toBeUndefined();
        expect(() => calendarWriteTools({ client, deleteLimit: 'x' as never })).toThrow(InvalidAgentDefinitionError);
    });

    it('asks one limit approval with the listing, then deletes without the classifier or a second approval', async () => {
        const server = deleteFake();
        const classifier = mockModel([decision('routine')]);
        const write = createWriteEngine({
            fake: server,
            model: mockModel([deleteCall(ONE, 'd1'), deleteCall(TWO, 'd2'), done]),
            classifierModel: classifier,
            deleteLimit: { max: 1 },
        });
        const runId = await write.dispatch();

        expect(kept(server)).toEqual(['two.ics']);
        expect(write.sent).toHaveLength(1);
        expect(write.sent[0]!.message.title).toMatch(DELETE_LIMIT_TITLE);
        expect(write.sent[0]!.message.body).toBe(TWO_LINE);

        await write.answer(runId, true);

        expect(kept(server)).toEqual([]);
        expect(classifier.doGenerateCalls).toHaveLength(1);
        expect(write.sent).toHaveLength(1);
    });

    it('names who the server may notify in the limit listing', async () => {
        const guest: FakeObject = {
            name: 'guest.ics',
            etag: '"guest"',
            ics: calendar(vevent(
                'UID:guest',
                'DTSTART:20261020T080000Z',
                'DTEND:20261020T090000Z',
                'SUMMARY:Lunch',
                'ATTENDEE:mailto:alice@example.com',
            )),
        };
        const server = createFakeCalDav([{
            slug: 'home', 
            name: 'Home', 
            objects: [ONE, guest], 
        }]);
        const write = createWriteEngine({
            fake: server,
            model: mockModel([deleteCall(ONE, 'd1'), deleteCall(guest, 'd2'), done]),
            classifierModel: mockModel([decision('routine')]),
            deleteLimit: { max: 1 },
        });

        await write.dispatch();

        expect(write.sent[0]!.message.title).toMatch(DELETE_LIMIT_TITLE);
        expect(write.sent[0]!.message.body).toBe([
            '2026-10-20 10:00 to 2026-10-20 11:00 (Europe/Berlin) | Lunch | 1 attendee | Home',
            'Notified: alice@example.com',
            'The calendar server may notify them.',
        ].join('\n'));
    });

    it('shows the recorded listing when the limit asks again in the same call', async () => {
        const server = deleteFake();
        const limit = (calendarWriteTools().calendar_delete as { limit?: ToolLimit }).limit!;
        const probe = defineTool({
            inputSchema: jsonSchema<Record<string, never>>({ type: 'object' }),
            execute: async (_input, { context }) => [
                await limit.detail!({ event: eventOf(TWO) }, context),
                await limit.detail!({ event: eventOf(TWO) }, context),
            ],
        });
        const write = createWriteEngine({
            fake: server,
            model: mockModel([{
                parts: [{
                    type: 'tool-call', 
                    toolName: 'probe', 
                    input: {}, 
                    toolCallId: 'p1', 
                }], 
            }, done]),
            tools: { probe },
        });
        const runId = await write.dispatch();
        const [step] = await write.steps(runId, 'probe');

        expect(step?.output).toEqual([TWO_LINE, TWO_LINE]);
    });

    it('shows the id alone for a recorded listing without its text', async () => {
        const server = deleteFake();
        const limit = (calendarWriteTools().calendar_delete as { limit?: ToolLimit }).limit!;
        const probe = defineTool({
            inputSchema: jsonSchema<Record<string, never>>({ type: 'object' }),
            execute: async (_input, { context }) => {
                // a record of an earlier version: the event only
                await once(context, 'calendar_delete:limit-listing', async () => ({ event: eventOf(TWO) }));

                return limit.detail!({ event: eventOf(TWO) }, context);
            },
        });
        const write = createWriteEngine({
            fake: server,
            model: mockModel([{
                parts: [{
                    type: 'tool-call', 
                    toolName: 'probe', 
                    input: {}, 
                    toolCallId: 'p1', 
                }], 
            }, done]),
            tools: { probe },
        });
        const runId = await write.dispatch();
        const [step] = await write.steps(runId, 'probe');

        expect(step?.output).toBe('icloud:home event two.ics');
    });

    it('still classifies and asks after a limit approval that could show only the id', async () => {
        const server = deleteFake();
        const client = createCalendarWriteClient([WRITE_ACCOUNT], { fetch: server.fetch, timezone: 'Europe/Berlin' });
        const classifier = mockModel([decision('routine'), decision('ask')]);
        const write = createWriteEngine({
            // the second describe, the one inside the limit's detail, fails
            client: flakyDescribe(client, 2),
            model: mockModel([deleteCall(ONE, 'd1'), deleteCall(TWO, 'd2'), done]),
            classifierModel: classifier,
            deleteLimit: { max: 1 },
        });
        const runId = await write.dispatch();

        expect(write.sent[0]!.message.title).toMatch(DELETE_LIMIT_TITLE);
        expect(write.sent[0]!.message.body).toBe('icloud:home event two.ics');

        await write.answer(runId, true);

        expect(classifier.doGenerateCalls).toHaveLength(2);
        expect(write.sent[1]!.message).toMatchObject({ title: 'Delete 1 event from Home?', body: TWO_LINE });

        await write.answer(runId, false);

        expect(kept(server)).toEqual(['two.ics']);
    });

    it('still classifies and asks after an agent limits entry, which shows no listing', async () => {
        const server = deleteFake();
        const write = createWriteEngine({
            fake: server,
            model: mockModel([deleteCall(ONE, 'd1'), deleteCall(TWO, 'd2'), done]),
            classifierModel: mockModel([decision('routine'), decision('ask')]),
            limits: { calendar_delete: { max: 1, windowMs: 3_600_000 } },
        });
        const runId = await write.dispatch();

        expect(kept(server)).toEqual(['two.ics']);
        expect(write.sent[0]!.message.title).toMatch(DELETE_LIMIT_TITLE);
        expect(write.sent[0]!.message.body ?? '').toBe('');

        await write.answer(runId, true);

        expect(write.sent[1]!.message).toMatchObject({ title: 'Delete 1 event from Home?', body: TWO_LINE });

        await write.answer(runId, false);

        expect(kept(server)).toEqual(['two.ics']);
    });

    it('shares the bucket deletes with another tool of the same limit', async () => {
        const server = deleteFake();
        const stub = defineTool({
            inputSchema: jsonSchema<{ n: number }>({ type: 'object' }),
            limit: {
                max: 20, 
                windowMs: 3_600_000, 
                bucket: 'deletes', 
            },
            execute: async () => 'ok',
        });
        const stubs: MockResponse = {
            parts: Array.from({ length: 20 }, (_, index) => ({
                type: 'tool-call' as const,
                toolName: 'stub_delete',
                input: { n: index },
                toolCallId: `s${index}`,
            })),
        };
        const write = createWriteEngine({
            fake: server,
            model: mockModel([stubs, deleteCall(ONE, 'd1'), done]),
            classifierModel: mockModel([decision('routine')]),
            tools: { stub_delete: stub },
        });
        const runId = await write.dispatch();

        expect(write.sent).toHaveLength(1);
        expect(write.sent[0]!.message.title).toMatch(/^Limit reached for calendar_delete: 20 of 20 used/);
        expect(kept(server)).toEqual(['one.ics', 'two.ics']);
        expect((await write.run(runId))?.status).toBe('waiting');
    });

    it('refuses a bucket shared with another max', async () => {
        const stub = defineTool({
            inputSchema: jsonSchema<{ n: number }>({ type: 'object' }),
            limit: {
                max: 20, 
                windowMs: 3_600_000, 
                bucket: 'deletes', 
            },
            execute: async () => 'ok',
        });
        let message: string | undefined;

        try {
            const write = createWriteEngine({
                fake: deleteFake(),
                model: mockModel([deleteCall(ONE, 'd1'), done]),
                tools: { stub_delete: stub },
                deleteLimit: { max: 10 },
            });
            const runId = await write.dispatch();

            message = (await write.run(runId))?.error?.message;
        } catch (error) {
            message = (error as Error).message;
        }

        expect(message).toMatch(/share the limit bucket "deletes" with a different max or windowMs/);
    });
});

