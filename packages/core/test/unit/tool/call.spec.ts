/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { jsonSchema } from 'ai';
import type { ToolSet } from 'ai';
import { describe, expect, it } from 'vitest';
import {
    InvalidRunStateError,
    createMemoryStore,
    defineTool,
    toolCallKey,
    wrapToolsForRun,
} from '@chamvi/core';
import type { ToolContext } from '@chamvi/core';

const context = { run: { runId: 'run' } } as ToolContext;

async function call(tools: ToolSet, id = 'call', ctx = context): Promise<unknown> {
    return tools.key!.execute!({}, {
        toolCallId: id,
        messages: [],
        context: ctx,
    });
}

describe('toolCallKey', () => {
    it('refuses calls outside a tool frame', () => {
        expect(() => toolCallKey(context)).toThrow(InvalidRunStateError);
    });

    it('retains replay identity and separates steps, calls and runs across awaits', async () => {
        const definition = defineTool({
            inputSchema: jsonSchema({ type: 'object' }),
            execute: async (_, { context: ctx }) => {
                const before = toolCallKey(ctx);

                await Promise.resolve();
                expect(toolCallKey(ctx)).toBe(before);

                return before;
            },
        });
        let step = 0;
        const store = createMemoryStore();
        const tools = wrapToolsForRun({ key: definition }, context, store.effects, { stepIndex: () => step });
        const first = await call(tools);

        expect(await call(tools)).toBe(first);

        const parallel = await Promise.all([call(tools, 'a'), call(tools, 'b')]);

        step++;

        const later = await call(tools);
        const otherContext = { run: { runId: 'other' } } as ToolContext;
        const otherRun = wrapToolsForRun({ key: definition }, otherContext, store.effects, { stepIndex: () => step });

        expect(new Set([first, ...parallel, later, await call(otherRun, 'call', otherContext)]).size).toBe(5);
    });

    it('refuses another run context and calls left after the frame settled', async () => {
        const release = Promise.withResolvers<void>();
        let late: Promise<string> | undefined;
        const definition = defineTool({
            inputSchema: jsonSchema({ type: 'object' }),
            execute: async (_, { context: ctx }) => {
                expect(() => toolCallKey({ run: { ...ctx.run, runId: 'other' } })).toThrow(InvalidRunStateError);
                late = release.promise.then(() => toolCallKey(ctx));

                return toolCallKey(ctx);
            },
        });
        const tools = wrapToolsForRun({ key: definition }, context, createMemoryStore().effects);

        await call(tools);
        expect(late).toBeDefined();
        release.resolve();
        await expect(late).rejects.toThrow(InvalidRunStateError);
    });
});
