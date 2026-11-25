/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { MockLanguageModelV4 } from 'ai/test';
import {
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { failingModel, mockModel } from '@chamvi/test-kit';
import type { MockResponse } from '@chamvi/test-kit';
import { encodeCalendarEventId } from '../../../src/event-id/module.ts';
import { createFakeCalDav, fakeObjectsOf } from '../../utils/caldav.ts';
import type { FakeCalDav } from '../../utils/caldav.ts';
import { createWriteEngine } from '../../utils/engine.ts';
import { calendar, vevent } from '../../utils/ics.ts';

const PAST = {
    name: 'past.ics',
    etag: '"past"',
    ics: calendar(vevent(
        'UID:past',
        'DTSTART:20261020T080000Z',
        'DTEND:20261020T090000Z',
        'SUMMARY:Dentist follow-up',
        'DESCRIPTION:secret description text',
        'LOCATION:Secret Street 1',
        'ORGANIZER;CN=Peter Owner:mailto:peter@example.com',
        'ATTENDEE:mailto:peter@example.com',
    )),
};

const EVENT = encodeCalendarEventId({
    calendar: 'icloud:home', 
    name: PAST.name, 
    etag: PAST.etag, 
});

const deleteCall: MockResponse = {
    parts: [{
        type: 'tool-call',
        toolName: 'calendar_delete',
        input: { event: EVENT },
        toolCallId: 'd1',
    }],
};

const done: MockResponse = { parts: [{ type: 'text', text: 'Done.' }] };

function fake(): FakeCalDav {
    return createFakeCalDav([{
        slug: 'home', 
        name: 'Home', 
        objects: [PAST], 
    }]);
}

function kept(server: FakeCalDav): boolean {
    return fakeObjectsOf(server.calendars[0]!).some((item) => item.name === PAST.name);
}

function holdingModel() {
    return new MockLanguageModelV4({
        doGenerate: ({ abortSignal }) => new Promise((_, reject) => {
            abortSignal?.addEventListener('abort', () => reject(abortSignal.reason));
        }),
    });
}

describe('the calendar delete classifier', () => {
    it('sees title, start, end, allDay and the attendee count only', async () => {
        const server = fake();
        const classifier = mockModel([{ parts: [{ type: 'text', text: '{"decision":"routine"}' }] }]);
        const write = createWriteEngine({
            fake: server, 
            model: mockModel([deleteCall, done]), 
            classifierModel: classifier, 
        });
        const runId = await write.dispatch();

        expect(classifier.doGenerateCalls).toHaveLength(1);

        const prompt = JSON.stringify(classifier.doGenerateCalls[0]!.prompt);

        for (const value of ['Dentist follow-up', '2026-10-20T10:00:00+02:00', '2026-10-20T11:00:00+02:00', 'allDay', 'attendees']) {
            expect(prompt).toContain(value);
        }

        for (const value of ['secret description text', 'Secret Street', 'Peter Owner', 'peter@example.com']) {
            expect(prompt).not.toContain(value);
        }

        expect(kept(server)).toBe(false);
        expect((await write.run(runId))?.taint).toBeUndefined();
    });

    it.each([
        ['a model error', () => failingModel()],
        ['unparsable output', () => mockModel([{ parts: [{ type: 'text', text: 'routine, I think' }] }])],
        ['an unknown decision', () => mockModel([{ parts: [{ type: 'text', text: '{"decision":"delete"}' }] }])],
    ])('asks on %s', async (_, classifier) => {
        const server = fake();
        const write = createWriteEngine({
            fake: server, 
            model: mockModel([deleteCall, done]), 
            classifierModel: classifier(), 
        });
        const runId = await write.dispatch();

        expect(await write.waiting(runId)).toMatchObject({ title: 'Delete 1 event from Home?' });
        expect(kept(server)).toBe(true);
    });

    it('asks when the classifier holds past timeoutMs on the clock', async () => {
        const server = fake();
        const classifier = holdingModel();
        const write = createWriteEngine({
            fake: server,
            model: mockModel([deleteCall, done]),
            classifierModel: classifier,
            timeoutMs: 5000,
        });
        const dispatched = write.dispatch();

        await vi.waitFor(() => expect(classifier.doGenerateCalls).toHaveLength(1));
        write.clock.advance(4999);
        await new Promise((resolve) => {
            setTimeout(resolve, 20);
        });

        expect(write.sent).toEqual([]);

        write.clock.advance(1);

        const runId = await dispatched;

        await vi.waitFor(async () => expect(await write.waiting(runId)).toMatchObject({ title: 'Delete 1 event from Home?' }));
        expect(kept(server)).toBe(true);
    });
});
