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

    it('tells a scan cut at CHAT_ANSWER_SCAN_MAX', async () => {
        const { engine, ids } = await waitingRuns([
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
        const elsewhere = (await engine.runService.findOne(ids[0]!))!;

        // older waiting approvals of other chats fill the whole scan
        for (let index = 1; index < CHAT_ANSWER_SCAN_MAX; index++) {
            await engine.runService.create({ ...elsewhere, id: randomUUID() });
        }

        const open = await findOpenChatApprovals(engine, { channel: 'chat', address: 'dm:1' });

        expect(open).toEqual({ runs: [], truncated: true });
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

    it('tells a quote of a closed approval message', async () => {
        const open = await twoOpen();

        expect(pickChatApproval(open, {
            quotedId: 'm:gone',
            platform: quoting,
            isApprovalMessage: (id) => id === 'm:gone',
        })).toEqual({ notice: 'closed' });
    });

    it('never tells closed after a cut scan: the quoted approval may be open unseen', async () => {
        const open = await twoOpen();

        expect(pickChatApproval(open, {
            quotedId: 'm:gone',
            platform: quoting,
            isApprovalMessage: () => true,
            truncated: true,
        })).toBeUndefined();
    });

    it('passes a quote of some other message through', async () => {
        const open = await twoOpen();

        expect(pickChatApproval(open, {
            quotedId: 'm:chatter',
            platform: quoting,
            isApprovalMessage: () => false,
        })).toBeUndefined();
        expect(pickChatApproval(open.slice(0, 1), { quotedId: 'm:chatter', platform: quoting })).toBeUndefined();
    });

    it('reads a quote on a platform without sentMessageId as no quote', async () => {
        const open = await twoOpen();
        const [first] = open;

        expect(pickChatApproval(open.slice(0, 1), { quotedId: 'm:anything', platform: {} })).toEqual({ run: first });
        expect(pickChatApproval(open, { quotedId: 'm:anything' })).toEqual({ notice: 'several' });
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
