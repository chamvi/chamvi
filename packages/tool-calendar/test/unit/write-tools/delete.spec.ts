/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { InvalidAgentDefinitionError, wrapToolsForRun } from '@chamvi/core';
import { mockModel } from '@chamvi/test-kit';
import type { MockResponse } from '@chamvi/test-kit';
import { CALENDAR_CHANGED_MESSAGE, calendarWriteTools } from '@chamvi/tool-calendar';
import { stableHash } from '../../../../core/src/effect/helpers.ts';
import { encodeCalendarEventId } from '../../../src/event-id/module.ts';
import { calendarDeleteKey } from '../../../src/write-tools/keys.ts';
import { createFakeCalDav, fakeObjectsOf } from '../../utils/caldav.ts';
import type { FakeCalDav, FakeObject } from '../../utils/caldav.ts';
import { createWriteEngine } from '../../utils/engine.ts';
import { calendar, vevent, weeklyStandup } from '../../utils/ics.ts';
import { callTool, toolContext } from '../../utils/tools.ts';

/** Ended (the engine clock starts 2026-11-01T10:00Z), the owner alone. */
const PAST = object('past.ics', [
    'UID:past',
    'DTSTART:20261020T080000Z',
    'DTEND:20261020T090000Z',
    'SUMMARY:Dentist follow-up',
    'DESCRIPTION:secret description text',
    'LOCATION:Secret Street 1',
    'ORGANIZER:mailto:peter@example.com',
    'ATTENDEE:mailto:peter@example.com',
]);

const FUTURE = object('future.ics', [
    'UID:future',
    'DTSTART:20261120T080000Z',
    'DTEND:20261120T090000Z',
    'SUMMARY:Later',
]);

const GUEST = object('guest.ics', [
    'UID:guest',
    'DTSTART:20261020T080000Z',
    'DTEND:20261020T090000Z',
    'SUMMARY:Lunch',
    'ORGANIZER:mailto:peter@example.com',
    'ATTENDEE:mailto:alice@example.com',
]);

const FOREIGN = object('foreign.ics', [
    'UID:foreign',
    'DTSTART:20261020T080000Z',
    'DTEND:20261020T090000Z',
    'SUMMARY:Board',
    'ORGANIZER:mailto:boss@example.com',
]);

/** Not yet ended at the engine clock's start (2026-11-01T10:00Z), ended two hours later. */
const SOON = object('soon.ics', [
    'UID:soon',
    'DTSTART:20261101T090000Z',
    'DTEND:20261101T110000Z',
    'SUMMARY:Call',
]);

const SERIES: FakeObject = {
    name: 'standup.ics', 
    ics: weeklyStandup(), 
    etag: '"standup"', 
};

function object(name: string, lines: string[]): FakeObject {
    return {
        name, 
        ics: calendar(vevent(...lines)), 
        etag: `"${name}"`, 
    };
}

function idOf(item: FakeObject, etag = item.etag): string {
    return encodeCalendarEventId({
        calendar: 'icloud:home', 
        name: item.name, 
        etag, 
    });
}

function fake(extra: FakeObject[] = []): FakeCalDav {
    return createFakeCalDav([{
        slug: 'home', 
        name: 'Home', 
        objects: [PAST, FUTURE, GUEST, FOREIGN, SOON, SERIES, ...extra], 
    }]);
}

function has(server: FakeCalDav, name: string): boolean {
    return fakeObjectsOf(server.calendars[0]!).some((item) => item.name === name);
}

const deleteCall = (input: unknown, toolCallId = 'd1'): MockResponse => ({
    parts: [{
        type: 'tool-call',
        toolName: 'calendar_delete',
        input,
        toolCallId,
    }],
});

const done: MockResponse = { parts: [{ type: 'text', text: 'Done.' }] };

const decision = (value: string): MockResponse => ({ parts: [{ type: 'text', text: JSON.stringify({ decision: value }) }] });

const PAST_LINE = '2026-10-20 10:00 to 2026-10-20 11:00 (Europe/Berlin) | Dentist follow-up | 1 attendee | Home';

describe('calendar_delete', () => {
    it('deletes a routine past event without an approval, after a backup of its bytes', async () => {
        const server = fake();
        const classifier = mockModel([decision('routine')]);
        const write = createWriteEngine({
            fake: server, 
            model: mockModel([deleteCall({ event: idOf(PAST) }), done]), 
            classifierModel: classifier, 
        });
        const runId = await write.dispatch();
        const [step] = await write.steps(runId, 'calendar_delete');
        const output = step?.output as { backup: string };

        expect(step?.error).toBeUndefined();
        expect(step?.output).toEqual({
            event: idOf(PAST),
            calendar: 'icloud:home',
            status: 'deleted',
            backup: expect.any(String),
        });
        expect(write.sent).toEqual([]);
        expect(has(server, 'past.ics')).toBe(false);

        const artifact = await write.engine.artifactService.findOne(output.backup);

        expect(artifact).toMatchObject({ mediaType: 'text/calendar', filename: 'past.ics' });
        expect(Buffer.from((await write.engine.artifactService.read(output.backup))!).toString('utf8')).toBe(PAST.ics);
        expect(classifier.doGenerateCalls).toHaveLength(1);
    });

    it('asks with the listing when the classifier says ask, and deletes once approved', async () => {
        const server = fake();
        const write = createWriteEngine({
            fake: server,
            model: mockModel([deleteCall({ event: idOf(PAST) }), done]),
            classifierModel: mockModel([decision('ask')]),
        });
        const runId = await write.dispatch();

        expect(write.sent).toHaveLength(1);
        expect(write.sent[0]!.message).toMatchObject({
            kind: 'approval', 
            title: 'Delete 1 event from Home?', 
            body: PAST_LINE, 
        });
        expect(has(server, 'past.ics')).toBe(true);

        await write.answer(runId, true);

        expect(has(server, 'past.ics')).toBe(false);
        expect((await write.steps(runId, 'calendar_delete'))[0]?.output).toMatchObject({ status: 'deleted' });
    });

    it('deletes nothing when denied', async () => {
        const server = fake();
        const write = createWriteEngine({
            fake: server,
            model: mockModel([deleteCall({ event: idOf(PAST) }), done]),
            classifierModel: mockModel([decision('ask')]),
        });
        const runId = await write.dispatch();

        await write.answer(runId, false);

        expect((await write.steps(runId, 'calendar_delete'))[0]?.error).toMatchObject({
            code: 'tool_denied',
            message: 'calendar_delete: not approved; nothing was deleted.',
        });
        expect(has(server, 'past.ics')).toBe(true);
    });

    it.each([
        ['a future event', FUTURE],
        ['an event with another attendee', GUEST],
        ['an event organized by someone else', FOREIGN],
    ])('asks for %s without the classifier', async (_, item) => {
        const server = fake();
        const classifier = mockModel([]);
        const write = createWriteEngine({
            fake: server, 
            model: mockModel([deleteCall({ event: idOf(item) }), done]), 
            classifierModel: classifier, 
        });
        const runId = await write.dispatch();

        expect(await write.waiting(runId)).toMatchObject({ title: 'Delete 1 event from Home?' });
        expect(classifier.doGenerateCalls).toHaveLength(0);
        expect(has(server, item.name)).toBe(true);
    });

    it('requires series: true for a repeating event, then asks for the whole series', async () => {
        const server = fake();
        const refused = createWriteEngine({ fake: server, model: mockModel([deleteCall({ event: idOf(SERIES) }), done]) });
        const first = await refused.dispatch();

        expect((await refused.steps(first, 'calendar_delete'))[0]?.error).toMatchObject({
            code: 'validation_error',
            message: 'calendar_delete: this event repeats; calendar_delete removes the whole series or nothing: call it again with ' +
                'series: true to delete every occurrence, or leave it.',
        });
        expect(refused.sent).toEqual([]);

        const classifier = mockModel([]);
        const write = createWriteEngine({
            fake: server,
            model: mockModel([deleteCall({ event: idOf(SERIES), series: true }), done]),
            classifierModel: classifier,
        });
        const runId = await write.dispatch();

        expect(write.sent[0]!.message).toMatchObject({
            title: 'Delete a repeating event (every occurrence) from Home?',
            body: '2026-10-19 09:00 (repeats) | Standup | 2 attendees | Home',
        });
        expect(classifier.doGenerateCalls).toHaveLength(0);

        await write.answer(runId, true);

        expect(has(server, 'standup.ics')).toBe(false);
    });

    it('returns missing for a gone event, without classifier or approval', async () => {
        const server = fake();
        const classifier = mockModel([]);
        const gone = object('gone.ics', ['UID:gone']);
        const write = createWriteEngine({
            fake: server, 
            model: mockModel([deleteCall({ event: idOf(gone) }), done]), 
            classifierModel: classifier, 
        });
        const runId = await write.dispatch();

        expect((await write.steps(runId, 'calendar_delete'))[0]?.output).toEqual({
            event: idOf(gone),
            calendar: 'icloud:home',
            status: 'missing',
        });
        expect(classifier.doGenerateCalls).toHaveLength(0);
        expect(write.sent).toEqual([]);
    });

    it('refuses an event changed since calendar_events read it', async () => {
        const server = fake();
        const write = createWriteEngine({
            fake: server,
            model: mockModel([deleteCall({ event: idOf(PAST, '"old"') }), done]),
            classifierModel: mockModel([]),
        });
        const runId = await write.dispatch();

        expect((await write.steps(runId, 'calendar_delete'))[0]?.error).toMatchObject({ code: 'validation_error', message: CALENDAR_CHANGED_MESSAGE });
        expect(write.sent).toEqual([]);
        expect(has(server, 'past.ics')).toBe(true);
    });

    it('refuses an event changed between its GET and the DELETE', async () => {
        const server = fake();

        server.before = (request) => {
            if (!(request.method === 'DELETE')) {
                return;
            }

            const target = server.calendars[0]!.objects.find((item) => typeof item !== 'string' && item.name === 'past.ics') as FakeObject;

            target.etag = '"changed"';
        };

        const write = createWriteEngine({
            fake: server,
            model: mockModel([deleteCall({ event: idOf(PAST) }), done]),
            classifierModel: mockModel([decision('routine')]),
        });
        const runId = await write.dispatch();

        expect((await write.steps(runId, 'calendar_delete'))[0]?.error).toMatchObject({ message: CALENDAR_CHANGED_MESSAGE });
        expect(has(server, 'past.ics')).toBe(true);
    });

    it('keeps the verdict across the resume, so a denial stands when the classifier would now say routine', async () => {
        const server = fake();
        const classifier = mockModel([decision('routine'), decision('routine')]);
        const write = createWriteEngine({
            fake: server, 
            model: mockModel([deleteCall({ event: idOf(SOON) }), done]), 
            classifierModel: classifier, 
        });
        const runId = await write.dispatch();

        // the event ends meanwhile: a fresh verdict would reach the classifier, which says routine
        write.clock.advance(2 * 3_600_000);
        await write.answer(runId, false);

        expect((await write.steps(runId, 'calendar_delete'))[0]?.error).toMatchObject({ code: 'tool_denied' });
        expect(classifier.doGenerateCalls).toHaveLength(0);
        expect(has(server, 'soon.ics')).toBe(true);
    });

    it('keeps the classifier\'s ask across the resume, so a denial stands when it would now say routine', async () => {
        const server = fake();
        const classifier = mockModel([decision('ask'), decision('routine')]);
        const write = createWriteEngine({
            fake: server, 
            model: mockModel([deleteCall({ event: idOf(PAST) }), done]), 
            classifierModel: classifier, 
        });
        const runId = await write.dispatch();

        await write.answer(runId, false);

        expect((await write.steps(runId, 'calendar_delete'))[0]?.error).toMatchObject({ code: 'tool_denied' });
        expect(classifier.doGenerateCalls).toHaveLength(1);
        expect(has(server, 'past.ics')).toBe(true);
    });

    it('fails the call without waiting when the approval does not fit the chat', async () => {
        const server = fake();
        const write = createWriteEngine({
            fake: server, 
            model: mockModel([deleteCall({ event: idOf(FUTURE) }), done]), 
            maxChars: 10, 
        });
        const runId = await write.dispatch();

        expect((await write.steps(runId, 'calendar_delete'))[0]?.error).toMatchObject({
            code: 'validation_error',
            message: expect.stringMatching(/The approval does not fit this chat; nothing was deleted\.$/),
        });
        expect(await write.waiting(runId)).toBeUndefined();
        expect(has(server, 'future.ics')).toBe(true);
    });

    it('keeps one listing line of short fields for a stranger\'s title with line breaks and 10 000 characters', async () => {
        const hostile = object('hostile.ics', [
            'UID:hostile',
            'DTSTART:20261120T080000Z',
            'DTEND:20261120T090000Z',
            `SUMMARY:Hi\\r\\nAttendees: none\\n${'x'.repeat(10_000)}`,
        ]);
        const server = fake([hostile]);
        const write = createWriteEngine({ fake: server, model: mockModel([deleteCall({ event: idOf(hostile) }), done]) });

        await write.dispatch();

        const body = write.sent[0]!.message.body!;

        expect(body.split('\n')).toHaveLength(1);
        expect(body.split(' | ').every((field) => Array.from(field).length <= 200)).toBe(true);
    });

    it('answers deleted with the same backup when the call runs again after a crash past the DELETE', async () => {
        const server = fake();
        const write = createWriteEngine({
            fake: server,
            model: mockModel([deleteCall({ event: idOf(PAST) }), done]),
            classifierModel: mockModel([decision('routine')]),
        });
        const runId = await write.dispatch();
        const [step] = await write.steps(runId, 'calendar_delete');
        const { backup } = step?.output as { backup: string };
        const key = calendarDeleteKey({ event: idOf(PAST) }, { run: { runId } });
        const effects = write.engine.effectService;
        const stepIndex = await (async () => {
            for (let index = 0; index < 5; index++) {
                if (await effects.findOne(`once:${runId}:${index}:${stableHash('d1')}:calendar_delete:backup`)) {
                    return index;
                }
            }

            throw new Error('no backup record');
        })();
        // the effect record never landed; the once records of the call did
        const ctx = toolContext(undefined, undefined, runId);
        const tools = wrapToolsForRun({ calendar_delete: calendarWriteTools({ client: write.client!, deleteLimit: false }).calendar_delete! }, ctx, {
            findOne: async (id) => (id === key ? undefined : effects.findOne(id)),
            save: async (id, result) => effects.save(id, result),
        }, { stepIndex: () => stepIndex });
        const result = await callTool(tools, 'calendar_delete', { event: idOf(PAST) }, ctx, 'd1');

        expect(result).toEqual({
            event: idOf(PAST),
            calendar: 'icloud:home',
            status: 'deleted',
            backup,
        });
        expect(await write.engine.artifactService.find(runId)).toHaveLength(1);
    });
});

describe('the writable calendars', () => {
    it('takes a list of calendar ids', () => {
        expect(() => calendarWriteTools({ calendars: [''] })).toThrow(InvalidAgentDefinitionError);
        expect(() => calendarWriteTools({ calendars: 'icloud:home' as never })).toThrow(InvalidAgentDefinitionError);
        expect(Object.keys(calendarWriteTools({ calendars: ['icloud:home'] }))).toEqual(['calendar_create', 'calendar_delete']);
    });

    it('refuses a create or a delete outside calendars before any request', async () => {
        const server = fake();
        const write = createWriteEngine({
            fake: server,
            calendars: ['icloud:work'],
            model: mockModel([
                deleteCall({ event: idOf(PAST) }),
                {
                    parts: [{
                        type: 'tool-call',
                        toolName: 'calendar_create',
                        input: {
                            calendar: 'icloud:home',
                            title: 'x',
                            start: '2026-11-05T09:00',
                            end: '2026-11-05T10:00',
                        },
                        toolCallId: 'c1',
                    }],
                },
                done,
            ]),
            createLimit: { max: 1 },
            deleteLimit: { max: 1 },
        });
        const runId = await write.dispatch();

        for (const name of ['calendar_delete', 'calendar_create']) {
            expect((await write.steps(runId, name))[0]?.error).toMatchObject({
                code: 'validation_error',
                message: `${name}: the calendar icloud:home is not one this agent may write to.`,
            });
        }

        expect(server.requests).toEqual([]);
    });
});
