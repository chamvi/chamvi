/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import { z } from 'zod';
import { defineEffectTool, defineModelAgent, defineTool } from '@chamvi/core';
import type { Engine, IChannel } from '@chamvi/core';
import type { ApprovalWaitPoint, Run } from '@chamvi/store';
import { ControllableClock, approvalModel, createTestEngine } from '@chamvi/test-kit';
import { CHAT_ANSWER_SCAN_MAX } from '../../../src/answer/constants.ts';
import { findOpenChatApprovals, pickChatApproval } from '../../../src/answer/open.ts';
import type { IChatPlatform } from '../../../src/channel/types.ts';

type Ask = {
    channel: string;
    address: string;
    title: string;
    timeoutMs?: number;
    options?: boolean;
    /** A trust gate instead: an effect tool on the run tainted by the untrusted `chat`, gated to `address` of `chat`. */
    gated?: boolean;
};

const askInput = z.object({
    channel: z.string(),
    address: z.string(),
    title: z.string(),
    timeoutMs: z.number().optional(),
    options: z.boolean().optional(),
    gated: z.boolean().optional(),
});

const ask = defineTool({
    inputSchema: askInput,
    execute: async (input, { context }) => {
        const decision = await context.channels.findOneOrFail(input.channel).approve({
            title: input.title,
            address: input.address,
            ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
            ...(input.options ? { options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] } : {}),
        });

        return decision.approved ? 'approved' : 'denied';
    },
});

const send = defineEffectTool({
    inputSchema: z.object({}),
    trust: { guardWhenTainted: true },
    execute: async () => 'sent',
});

// `chat` is untrusted: a run it starts is tainted
const silent = (name: string, untrusted = false): IChannel => ({
    name,
    untrusted,
    out: async () => {},
});

const engines: Engine[] = [];

afterEach(() => {
    for (const engine of engines) {
        engine.stop();
    }

    engines.length = 0;
});

/** One agent per request, each pausing its run on that approval. */
async function waitingRuns(requests: Ask[]) {
    const clock = new ControllableClock(new Date('2026-11-01T09:00:00Z'));
    const agents = requests.map((request, index) => defineModelAgent({
        name: `asker-${index}`,
        instructions: 'Ask.',
        model: approvalModel(request.gated ? 'send' : 'ask', request.gated ? {} : request),
        tools: request.gated ? { send } : { ask },
    }));
    const engine = createTestEngine({
        agents,
        channels: [silent('chat', true), silent('other')],
        clock,
    });

    engines.push(engine);
    await engine.start();

    const ids: string[] = [];

    for (const [index, agent] of agents.entries()) {
        const request = requests[index]!;
        const { runId } = await engine.dispatch({
            agent: agent.name,
            trigger: 'test',
            // a run from the untrusted `chat` is tainted, and its trust gate asks through `chat` and its address
            ...(request.gated ? { channel: 'chat', address: request.address } : { channel: 'other' }),
            payload: {},
        });

        ids.push(runId);
        await engine.idle();
        clock.advance(1);
    }

    for (const id of ids) {
        expect((await engine.runService.findOne(id))?.status).toBe('waiting');
    }

    return {
        engine,
        clock,
        ids,
    };
}

function approvalKey(run: Run) {
    return `${run.id}:${(run.waiting as ApprovalWaitPoint).approvalId}`;
}

/** A platform that names the message it sent under a key `m:<key>`. */
const quoting: IChatPlatform = { sentMessageId: ({ key }) => `m:${key}` };

describe('findOpenChatApprovals', () => {
    it('finds the approvals open on the channel and address, oldest first', async () => {
        const { engine, ids } = await waitingRuns([
            {
                channel: 'chat',
                address: 'dm:1',
                title: 'first',
            },
            {
                channel: 'chat',
                address: 'dm:2',
                title: 'other address',
            },
            {
                channel: 'other',
                address: 'dm:1',
                title: 'other channel',
            },
            {
                channel: 'chat',
                address: 'dm:1',
                title: 'with options',
                options: true,
            },
            {
                channel: 'chat',
                address: 'dm:1',
                title: 'second',
            },
        ]);

        const open = await findOpenChatApprovals(engine, { channel: 'chat', address: 'dm:1' });

        expect(open).toEqual({ runs: [expect.objectContaining({ id: ids[0] }), expect.objectContaining({ id: ids[4] })], truncated: false });
    });

    it('leaves out a trust-gate approval: its chat message carried no arguments', async () => {
        const { engine, ids } = await waitingRuns([
            {
                channel: 'chat',
                address: 'dm:1',
                title: 'gate',
                gated: true,
            },
            {
                channel: 'chat',
                address: 'dm:1',
                title: 'plain',
            },
        ]);
        const gate = (await engine.runService.findOne(ids[0]!))?.waiting as ApprovalWaitPoint;

        expect(gate).toMatchObject({
            channel: 'chat',
            address: 'dm:1',
            notification: expect.any(String),
        });
        expect(gate.options).toBeUndefined();

        const open = await findOpenChatApprovals(engine, { channel: 'chat', address: 'dm:1' });

        expect(open.runs.map((run) => run.id)).toEqual([ids[1]]);
    });

    it('leaves out an approval whose expiry has come', async () => {
        const {
            engine,
            clock,
            ids,
        } = await waitingRuns([
            {
                channel: 'chat',
                address: 'dm:1',
                title: 'short',
                timeoutMs: 1_000,
            },
            {
                channel: 'chat',
                address: 'dm:1',
                title: 'long',
            },
        ]);
        const short = await engine.runService.findOne(ids[0]!);
        const { expiresAt } = (short?.waiting as ApprovalWaitPoint);

        // stopped, so no tick denies it: only the helper's own expiry check is left
        engine.stop();
        clock.advance(new Date(expiresAt).getTime() - clock.now());
        expect((await engine.runService.findOne(ids[0]!))?.status).toBe('waiting');

        const open = await findOpenChatApprovals(engine, { channel: 'chat', address: 'dm:1' });

        expect(open.runs.map((run) => run.id)).toEqual([ids[1]]);
    });

    /** `count` waiting approvals of other chats, all older than the runs of `waitingRuns()` after the first */
    async function behindUnrelated(count: number) {
        const ctx = await waitingRuns([
            {
                channel: 'other',
                address: 'elsewhere',
                title: 'elsewhere',
            },
            {
                channel: 'chat',
                address: 'dm:1',
                title: 'mine',
            },
        ]);
        const elsewhere = (await ctx.engine.runService.findOne(ctx.ids[0]!))!;

        for (let index = 1; index < count; index++) {
            await ctx.engine.runService.create({ ...elsewhere, id: randomUUID() });
        }

        return ctx;
    }

    it('pages past CHAT_ANSWER_SCAN_MAX unrelated waiting approvals to the ones of this chat', async () => {
        const { engine, ids } = await behindUnrelated(CHAT_ANSWER_SCAN_MAX * 2);

        const open = await findOpenChatApprovals(engine, { channel: 'chat', address: 'dm:1' });

        expect(open).toEqual({ runs: [expect.objectContaining({ id: ids[1] })], truncated: false });
    });

    it('tells a scan cut when its page budget runs out with rows left', async () => {
        const { engine, ids } = await behindUnrelated(CHAT_ANSWER_SCAN_MAX);

        expect(await findOpenChatApprovals(engine, { channel: 'chat', address: 'dm:1' }, 1)).toEqual({ runs: [], truncated: true });
        // one more page reaches the end: nothing is left out
        expect(await findOpenChatApprovals(engine, { channel: 'chat', address: 'dm:1' }, 2))
            .toEqual({ runs: [expect.objectContaining({ id: ids[1] })], truncated: false });
    });

    it('tells a scan cut when the waiting runs shifted between its pages', async () => {
        const { engine, ids } = await behindUnrelated(CHAT_ANSWER_SCAN_MAX * 2);
        const { runService } = engine;
        const find = runService.find.bind(runService);
        let calls = 0;

        runService.find = async (query) => {
            calls += 1;

            // an unrelated run of the first page settles before the second page is read
            if (calls === 2) {
                await runService.update(ids[0]!, { status: 'completed', waiting: undefined });
            }

            return find(query);
        };

        const open = await findOpenChatApprovals(engine, { channel: 'chat', address: 'dm:1' });

        expect(open.truncated).toBe(true);
    });
});

describe('pickChatApproval', () => {
    async function twoOpen() {
        const { engine } = await waitingRuns([
            {
                channel: 'chat',
                address: 'dm:1',
                title: 'first',
            },
            {
                channel: 'chat',
                address: 'dm:1',
                title: 'second',
            },
        ]);
        const { runs } = await findOpenChatApprovals(engine, { channel: 'chat', address: 'dm:1' });

        return runs as [Run, Run];
    }

    it('picks the quoted approval of several', async () => {
        const open = await twoOpen();
        const [, second] = open;

        expect(pickChatApproval(open, { quotedId: `m:${approvalKey(second)}`, platform: quoting })).toEqual({ run: second });
        // also after a cut scan: a quote names its approval
        expect(pickChatApproval(open, {
            quotedId: `m:${approvalKey(second)}`,
            platform: quoting,
            truncated: true,
        })).toEqual({ run: second });
    });

    it('answers nothing for a quote that matches no open approval, truncated or not', async () => {
        const open = await twoOpen();

        expect(pickChatApproval(open, { quotedId: 'm:gone', platform: quoting })).toBeUndefined();
        expect(pickChatApproval(open, {
            quotedId: 'm:gone',
            platform: quoting,
            truncated: true,
        })).toBeUndefined();
        expect(pickChatApproval(open.slice(0, 1), { quotedId: 'm:chatter', platform: quoting })).toBeUndefined();
    });

    it('answers nothing for a quote on a platform without sentMessageId: it may quote any message', async () => {
        const open = await twoOpen();

        expect(pickChatApproval(open.slice(0, 1), { quotedId: 'm:anything', platform: {} })).toBeUndefined();
        expect(pickChatApproval(open, { quotedId: 'm:anything' })).toBeUndefined();
    });

    it('picks the one open approval for a plain reply', async () => {
        const [first] = await twoOpen();

        expect(pickChatApproval([first], { platform: quoting })).toEqual({ run: first });
    });

    it('never picks one after a cut scan: asks for a quote instead', async () => {
        const [first] = await twoOpen();

        expect(pickChatApproval([first], { platform: quoting, truncated: true })).toEqual({ notice: 'several' });
        expect(pickChatApproval([], { platform: quoting, truncated: true })).toBeUndefined();
    });

    it('asks which approval when several are open and the reply quotes none', async () => {
        const open = await twoOpen();

        expect(pickChatApproval(open, { platform: quoting })).toEqual({ notice: 'several' });
    });

    it('answers nothing when no approval is open', () => {
        expect(pickChatApproval([], { platform: quoting })).toBeUndefined();
        expect(pickChatApproval([], { quotedId: 'm:x', platform: quoting })).toBeUndefined();
    });
});
