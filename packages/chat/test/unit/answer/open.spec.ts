/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import { z } from 'zod';
import { defineModelAgent, defineTool } from '@chamvi/core';
import type { Engine, IChannel } from '@chamvi/core';
import type { ApprovalWaitPoint, Run } from '@chamvi/store';
import { ControllableClock, approvalModel, createTestEngine } from '@chamvi/test-kit';
import { findOpenChatApprovals, pickChatApproval } from '../../../src/answer/open.ts';
import type { IChatPlatform } from '../../../src/channel/types.ts';

type Ask = {
    channel: string;
    address: string;
    title: string;
    timeoutMs?: number;
    options?: boolean;
};

const askInput = z.object({
    channel: z.string(),
    address: z.string(),
    title: z.string(),
    timeoutMs: z.number().optional(),
    options: z.boolean().optional(),
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

const silent = (name: string): IChannel => ({ name, out: async () => {} });

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
        model: approvalModel('ask', request),
        tools: { ask },
    }));
    const engine = createTestEngine({
        agents,
        channels: [silent('chat'), silent('other')],
        clock,
    });

    engines.push(engine);
    await engine.start();

    const ids: string[] = [];

    for (const agent of agents) {
        const { runId } = await engine.dispatch({
            agent: agent.name,
            trigger: 'test',
            channel: 'chat',
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

        expect(open.map((run) => run.id)).toEqual([ids[0], ids[4]]);
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

        expect(open.map((run) => run.id)).toEqual([ids[1]]);
    });
});

describe('pickChatApproval', () => {
    async function twoOpen() {
        const { engine, ids } = await waitingRuns([
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

        return { open: await findOpenChatApprovals(engine, { channel: 'chat', address: 'dm:1' }), ids };
    }

    it('picks the quoted approval of several', async () => {
        const { open } = await twoOpen();
        const [, second] = open as [Run, Run];

        expect(pickChatApproval(open, {
            channel: 'chat',
            quotedId: `m:${approvalKey(second)}`,
            platform: quoting,
        })).toEqual({ run: second });
    });

    it('tells a quote of a closed approval message', async () => {
        const { open } = await twoOpen();

        expect(pickChatApproval(open, {
            channel: 'chat',
            quotedId: 'm:gone',
            platform: quoting,
            isApprovalMessage: (id) => id === 'm:gone',
        })).toEqual({ notice: 'closed' });
    });

    it('passes a quote of some other message through', async () => {
        const { open } = await twoOpen();

        expect(pickChatApproval(open, {
            channel: 'chat',
            quotedId: 'm:chatter',
            platform: quoting,
            isApprovalMessage: () => false,
        })).toBeUndefined();
        expect(pickChatApproval(open.slice(0, 1), {
            channel: 'chat',
            quotedId: 'm:chatter',
            platform: quoting,
        })).toBeUndefined();
    });

    it('reads a quote on a platform without sentMessageId as no quote', async () => {
        const { open } = await twoOpen();
        const [first] = open as [Run];

        expect(pickChatApproval(open.slice(0, 1), {
            channel: 'chat',
            quotedId: 'm:anything',
            platform: {},
        })).toEqual({ run: first });
        expect(pickChatApproval(open, {
            channel: 'chat',
            quotedId: 'm:anything',
        })).toEqual({ notice: 'several' });
    });

    it('picks the one open approval for a plain reply', async () => {
        const { open } = await twoOpen();
        const [first] = open as [Run];

        expect(pickChatApproval([first], { channel: 'chat', platform: quoting })).toEqual({ run: first });
    });

    it('asks which approval when several are open and the reply quotes none', async () => {
        const { open } = await twoOpen();

        expect(pickChatApproval(open, { channel: 'chat', platform: quoting })).toEqual({ notice: 'several' });
    });

    it('answers nothing when no approval is open', () => {
        expect(pickChatApproval([], { channel: 'chat', platform: quoting })).toBeUndefined();
        expect(pickChatApproval([], {
            channel: 'chat',
            quotedId: 'm:x',
            platform: quoting,
        })).toBeUndefined();
    });
});
