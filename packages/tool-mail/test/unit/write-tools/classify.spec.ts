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
import { encodeMailId } from '@chamvi/tool-mail';
import { createWriteEngine } from '../../utils/engine.ts';
import type { FakeFolder } from '../../utils/imap.ts';
import { setupWrite } from '../../utils/write.ts';

function idOf(folder: string, uid: number): string {
    return encodeMailId({
        account: 'work',
        folder,
        uidValidity: '42',
        uid,
    });
}

function uidsOf(folders: FakeFolder[], path: string): number[] {
    return (folders.find((folder) => folder.path === path)!.messages ?? []).map((message) => message.uid);
}

const IDS = [idOf('Archive', 7), idOf('INBOX', 1)];

const deleteCall: MockResponse = {
    parts: [{
        type: 'tool-call',
        toolName: 'mail_delete',
        input: { ids: IDS },
        toolCallId: 'd1',
    }],
};

const done: MockResponse = { parts: [{ type: 'text', text: 'Done.' }] };

/** A model that answers only once its call is aborted. */
function holdingModel() {
    return new MockLanguageModelV4({
        doGenerate: ({ abortSignal }) => new Promise((_, reject) => {
            abortSignal?.addEventListener('abort', () => reject(abortSignal.reason));
        }),
    });
}

describe('the delete classifier', () => {
    it('sees from, subject, folder and date of each mail, never a body', async () => {
        const { client } = await setupWrite(false);
        const classifier = mockModel([{ parts: [{ type: 'text', text: '{"decision":"routine"}' }] }]);
        const write = createWriteEngine({
            client,
            model: mockModel([deleteCall, done]),
            classifierModel: classifier,
        });

        await write.dispatch();

        expect(classifier.doGenerateCalls).toHaveLength(1);

        const prompt = JSON.stringify(classifier.doGenerateCalls[0]!.prompt);

        for (const value of ['Alice <alice@x.test>', 'Re: Hello', 'Archive', 'INBOX', '2026-11-02T08:00:00.000Z', '2026-11-01T08:00:00.000Z']) {
            expect(prompt).toContain(value);
        }

        expect(prompt).toContain('newsletter');
        expect(prompt).not.toContain('An archived reply.');
        expect(prompt).not.toContain('the plain text body');
    });

    it.each([
        ['a model error', () => failingModel()],
        ['unparsable output', () => mockModel([{ parts: [{ type: 'text', text: 'routine, I think' }] }])],
        ['an unknown decision', () => mockModel([{ parts: [{ type: 'text', text: '{"decision":"delete"}' }] }])],
    ])('asks on %s', async (_, classifier) => {
        const { client, folders } = await setupWrite(false);
        const write = createWriteEngine({
            client,
            model: mockModel([deleteCall, done]),
            classifierModel: classifier(),
        });
        const runId = await write.dispatch();

        expect(await write.waiting(runId)).toMatchObject({ title: 'Delete 2 mails from work?' });
        expect(uidsOf(folders, 'INBOX')).toEqual([1, 2]);
        expect((await write.run(runId))?.taint).toBeUndefined();
    });

    it('asks when the classifier holds past timeoutMs on the clock', async () => {
        const { client, folders } = await setupWrite(false);
        const classifier = holdingModel();
        const write = createWriteEngine({
            client,
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

        await vi.waitFor(async () => expect(await write.waiting(runId)).toMatchObject({ title: 'Delete 2 mails from work?' }));
        expect(uidsOf(folders, 'INBOX')).toEqual([1, 2]);
    });

    it('leaves the run untainted on a routine decision', async () => {
        const { client } = await setupWrite(false);
        const write = createWriteEngine({
            client,
            model: mockModel([deleteCall, done]),
            classifierModel: mockModel([{ parts: [{ type: 'text', text: '{"decision":"routine"}' }] }]),
        });
        const runId = await write.dispatch();

        expect((await write.run(runId))?.taint).toBeUndefined();
    });
});
