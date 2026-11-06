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
import { jsonSchema } from 'ai';
import {
    Engine,
    approve,
    createMemoryStore,
    defineModelAgent,
    defineSimpleAgent,
    defineTool,
} from '@chamvi/core';
import { mockModel } from '@chamvi/test-kit';
import { fileTools } from '@chamvi/tool-files';
import type { ListArtifactsResult, ProcessFilesInput, ProcessFilesResult } from '@chamvi/tool-files';

const engines: Engine[] = [];

afterEach(async () => {
    await Promise.all(engines.splice(0).map((engine) => engine.stop()));
});

const bytes = (text: string) => new TextEncoder().encode(text);
const selection = { path: 'result.json', mediaType: 'application/json' };
const request = {
    agent: 'files',
    trigger: 'test',
    channel: 'test',
    payload: {},
};

async function start(engine: Engine) {
    engines.push(engine);
    await engine.start();

    const { runId } = await engine.dispatch({
        ...request,
        attachments: [{
            mediaType: 'application/json',
            filename: 'in.json',
            data: bytes('{"value":21}'),
        }],
    });

    await engine.idle();

    return runId;
}

describe('engine artifact processing', () => {
    it('taints catalog reads at the execution boundary', async () => {
        const store = createMemoryStore();
        const engine = new Engine({
            store,
            agents: [defineSimpleAgent({
                name: 'files',
                tools: fileTools(),
                run: async (_, ctx) => ctx.tools.list_artifacts!({}),
            })],
        });
        const runId = await start(engine);

        expect(await store.runs.findOne(runId)).toMatchObject({ status: 'completed', taint: { source: 'tool:list_artifacts' } });
        expect((await store.runs.findOne(runId))!.output).toMatchObject({ artifacts: [{ runId, filename: 'in.json' }] });
    });

    it('preserves same-call IDs and distinct-call artifacts across simple-agent approval replay', async () => {
        const store = createMemoryStore();
        let calls = 0;
        const engine = new Engine({
            store,
            agents: [defineSimpleAgent({
                name: 'files',
                tools: fileTools(),
                run: async (_, ctx) => {
                    calls++;

                    const first = await ctx.tools.process_files!({ command: 'echo first > result.json', outputs: [selection] }) as ProcessFilesResult;
                    const second = await ctx.tools.process_files!({ command: 'echo second > result.json', outputs: [selection] }) as ProcessFilesResult;

                    await approve(ctx, { title: 'Accept outputs?', artifacts: [first.artifacts[0]!.id, second.artifacts[0]!.id] });

                    return { first, second };
                },
            })],
        });
        const runId = await start(engine);
        const waiting = (await store.runs.findOne(runId))!;

        expect(waiting).toMatchObject({ status: 'waiting', taint: { source: 'tool:process_files' } });
        expect(waiting.waiting?.kind).toBe('approval');

        const before = await store.artifacts.find(runId);

        expect(before).toHaveLength(3);
        expect(before.filter((item) => item.filename === 'result.json')).toHaveLength(2);

        if (waiting.waiting?.kind !== 'approval') {
            throw new Error('expected approval');
        }

        await engine.approve(runId, { approvalId: waiting.waiting.approvalId, approved: true });
        await engine.idle();
        expect(calls).toBe(2);
        expect((await store.runs.findOne(runId))?.status).toBe('completed');
        expect((await store.artifacts.find(runId)).map((item) => item.id)).toEqual(before.map((item) => item.id));

        const result = (await store.runs.findOne(runId))!.output as { first: ProcessFilesResult; second: ProcessFilesResult };

        expect(new TextDecoder().decode(await store.artifacts.read(result.first.artifacts[0]!.id))).toBe('first\n');
        expect(new TextDecoder().decode(await store.artifacts.read(result.second.artifacts[0]!.id))).toBe('second\n');
    });

    it('discovers attachment IDs through a model catalog call and retains completed processing across engine restart', async () => {
        const store = createMemoryStore();
        const input: ProcessFilesInput = {
            command: 'jq ".value * 2" in.json > result.json',
            inputs: [{ artifactId: '', path: 'in.json' }],
            outputs: [selection],
        };
        const model = mockModel([
            {
                parts: [{
                    type: 'tool-call',
                    toolName: 'list_artifacts',
                    input: {},
                    toolCallId: 'catalog',
                }],
            },
            {
                parts: [{
                    type: 'tool-call',
                    toolName: 'process_files',
                    input,
                    toolCallId: 'process',
                }],
            },
            {
                parts: [{
                    type: 'tool-call',
                    toolName: 'accept',
                    input: {},
                    toolCallId: 'approve',
                }],
            },
            { parts: [{ type: 'text', text: 'Done.' }] },
        ]);
        const stream = model.doStream.bind(model);

        model.doStream = async (options) => {
            // Script the model's selection from the real tool response in its prompt.
            for (const message of options.prompt) {
                if (message.role !== 'tool') {
                    continue;
                }

                for (const part of message.content) {
                    if (part.type === 'tool-result' && part.toolName === 'list_artifacts' && part.output.type === 'json') {
                        const catalog = part.output.value as unknown as ListArtifactsResult;

                        input.inputs![0]!.artifactId = catalog.artifacts.find((item) => item.filename === 'in.json')!.id;
                    }
                }
            }

            return stream(options);
        };

        let processingCalls = 0;
        const agent = defineModelAgent({
            name: 'files',
            instructions: 'Transform files.',
            model,
            tools: {
                ...fileTools(),
                accept: defineTool({
                    inputSchema: jsonSchema({
                        type: 'object',
                        properties: {},
                        additionalProperties: false,
                    }),
                    execute: async (_, { context }) => {
                        await approve(context, { title: 'Accept?' });

                        return 'accepted';
                    },
                }),
            },
            hooks: {
                beforeToolExecution: (call) => {
                    if (call.toolName === 'process_files') {
                        processingCalls++;
                    }
                },
            },
        });
        const first = new Engine({ store, agents: [agent] });
        const runId = await start(first);
        const waiting = (await store.runs.findOne(runId))!;

        expect(waiting.status).toBe('waiting');
        expect(input.inputs![0]!.artifactId).toBe(`${runId}.0000`);
        expect(waiting.taint?.source).toBe('tool:list_artifacts');

        const artifacts = await store.artifacts.find(runId);

        expect(artifacts).toHaveLength(2);

        const result = artifacts.find((item) => item.filename === 'result.json')!;

        expect(new TextDecoder().decode(await store.artifacts.read(result.id))).toBe('42\n');
        expect(JSON.stringify((await store.checkpoints.findOne(runId))?.messages)).toContain(result.id);
        await first.stop();

        const resumed = new Engine({ store, agents: [agent] });

        engines.push(resumed);
        await resumed.start();

        if (waiting.waiting?.kind !== 'approval') {
            throw new Error('expected approval');
        }

        await resumed.approve(runId, { approvalId: waiting.waiting.approvalId, approved: true });
        await resumed.idle();
        expect((await store.runs.findOne(runId))?.status).toBe('completed');
        expect(processingCalls).toBe(1);
        expect((await store.artifacts.find(runId)).map((item) => item.id)).toEqual(artifacts.map((item) => item.id));
    });

    it('rejects another run artifact through the real execution boundary', async () => {
        const store = createMemoryStore();
        let foreignId = '';
        const engine = new Engine({
            store,
            agents: [defineSimpleAgent({
                name: 'files',
                tools: fileTools(),
                run: async (_, ctx) => ctx.tools.process_files!({ command: 'cat in', inputs: [{ artifactId: foreignId, path: 'in' }] }),
            })],
        });

        engines.push(engine);
        await store.artifacts.insert({
            id: 'foreign-file',
            runId: 'foreign',
            agent: 'files',
            mediaType: 'text/plain',
            size: 6,
            createdAt: new Date(0),
        }, bytes('secret'));
        foreignId = 'foreign-file';
        await engine.start();

        const { runId } = await engine.dispatch(request);

        await engine.idle();
        expect(await store.runs.findOne(runId)).toMatchObject({
            status: 'failed',
            error: { code: 'validation_error' },
            taint: { source: 'tool:process_files' },
        });
        expect(await store.artifacts.find(runId)).toEqual([]);
    });
});
