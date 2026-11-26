/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/errors';
import type { ToolSet } from 'ai';
import { 
    afterEach, 
    describe, 
    expect, 
    it, 
} from 'vitest';
import { z } from 'zod';
import { 
    InvalidRunStateError, 
    approve, 
    defineModelAgent, 
    defineTool, 
    once, 
} from '@chamvi/core';
import type { EffectResult, IEngine, ToolContext } from '@chamvi/core';
import { runToolCall } from '../../../src/effect/frame.ts';
import type { ToolCallFrame } from '../../../src/effect/types.ts';
import { approvalWait } from '../../utils/approvals.ts';
import { ControllableClock } from '../../utils/clock.ts';
import { createTestEngine } from '../../utils/engine.ts';
import { mockModel } from '../../utils/mock-model.ts';
import type { MockPart, MockResponse } from '../../utils/mock-model.ts';

const engines: IEngine[] = [];

afterEach(async () => {
    await Promise.all(engines.map((engine) => engine.stop()));
    engines.length = 0;
});

const call = (input: unknown, toolCallId: string): MockPart => ({
    type: 'tool-call',
    toolName: 'decide',
    input,
    toolCallId,
});
const turn = (...parts: MockPart[]): MockResponse => ({ parts });
const text = (t: string): MockResponse => ({ parts: [{ type: 'text', text: t }] });

async function runWith(tools: ToolSet, responses: MockResponse[]) {
    const engine = createTestEngine({
        clock: new ControllableClock(new Date(1_000_000)),
        agents: [defineModelAgent({
            name: 'release',
            instructions: 'You release.',
            model: mockModel(responses),
            tools,
        })],
    });

    engines.push(engine);
    await engine.start();

    const { runId } = await engine.dispatch({
        agent: 'release',
        trigger: 'http',
        channel: 'http',
        payload: {},
    });

    await engine.idle();

    return { engine, runId };
}

describe('once()', () => {
    it('keeps the value of a call across the resume after its approval', async () => {
        const computed: string[] = [];
        const values: string[] = [];
        let next = 'ask';
        const decide = defineTool({
            inputSchema: z.object({ n: z.number() }),
            execute: async (_input, { context }) => {
                const value = await once(context, 'verdict', async () => {
                    computed.push(next);

                    return next;
                });

                values.push(value);

                if (value === 'ask') {
                    const decision = await approve(context, { title: 'Go?' });

                    return decision.approved ? 'done' : 'denied';
                }

                return 'routine';
            },
        });
        const { engine, runId } = await runWith({ decide }, [turn(call({ n: 1 }, 'c1')), text('ok')]);
        const waiting = approvalWait(await engine.runService.findOne(runId));

        expect(waiting?.approvalId).toBe('0:c1:0');

        // the recomputed value would differ now
        next = 'routine';
        await engine.approve(runId, { approvalId: '0:c1:0', approved: false });
        await engine.idle();

        expect(computed).toEqual(['ask']);
        expect(values).toEqual(['ask', 'ask']);
        expect((await engine.runService.findOne(runId))?.status).toBe('completed');

        const [step] = (await engine.stepService.find(runId)).filter((s) => s.kind === 'tool');

        expect(step?.output).toBe('denied');
    });

    it('records nothing when fn throws, and keeps separate names and calls apart', async () => {
        let attempts = 0;
        const seen: unknown[] = [];
        const decide = defineTool({
            inputSchema: z.object({ n: z.number() }),
            execute: async ({ n }, { context }) => {
                try {
                    await once(context, 'fails', async () => {
                        attempts++;

                        throw new Error('boom');
                    });
                } catch {
                    // a second try runs fn again: the failure was not recorded
                    await once(context, 'fails', async () => {
                        attempts++;

                        return 1;
                    });
                }

                seen.push(await once(context, 'a', async () => `a${n}`), await once(context, 'b', async () => ({ b: n })));

                return 'ok';
            },
        });

        await runWith({ decide }, [turn(call({ n: 1 }, 'c1'), call({ n: 2 }, 'c2')), text('ok')]);

        expect(attempts).toBe(4);
        expect(seen).toEqual(['a1', { b: 1 }, 'a2', { b: 2 }]);
    });

    it('keeps calls apart whose call id and name would join to the same text', async () => {
        const seen: unknown[] = [];
        const first = Promise.withResolvers<void>();
        const decide = defineTool({
            inputSchema: z.object({ n: z.number() }),
            execute: async ({ n }, { context }) => {
                // the second call reads only after the first recorded its value
                if (n === 2) {
                    await first.promise;
                }

                // c1 'a:once:x' + 'y' and c2 'a' + 'x:once:y' both read 'a:once:x:once:y' joined
                seen.push(await once(context, n === 1 ? 'y' : 'x:once:y', async () => `value ${n}`));

                if (n === 1) {
                    first.resolve();
                }

                return 'ok';
            },
        });

        await runWith({ decide }, [turn(call({ n: 1 }, 'a:once:x'), call({ n: 2 }, 'a')), text('ok')]);

        expect(seen).toEqual(['value 1', 'value 2']);
    });

    it('refuses outside a tool call, for another run and for an invalid name', async () => {
        const ctx = { run: { runId: 'r1' } } as ToolContext;

        await expect(once(ctx, 'x', async () => 1)).rejects.toBeInstanceOf(InvalidRunStateError);

        const errors: unknown[] = [];
        const decide = defineTool({
            inputSchema: z.object({ n: z.number() }),
            execute: async (_input, { context }) => {
                for (const attempt of [
                    () => once({ ...context, run: { ...context.run, runId: 'other' } }, 'x', async () => 1),
                    () => once(context, '', async () => 1),
                    () => once(context, 'x'.repeat(129), async () => 1),
                ]) {
                    try {
                        await attempt();
                    } catch (error) {
                        errors.push(error);
                    }
                }

                return 'ok';
            },
        });

        await runWith({ decide }, [turn(call({ n: 1 }, 'c1')), text('ok')]);

        expect(errors).toHaveLength(3);
        expect(errors[0]).toBeInstanceOf(InvalidRunStateError);
        expect(errors[1]).toBeInstanceOf(ValidationError);
        expect(errors[2]).toBeInstanceOf(ValidationError);
    });

    describe('within one frame', () => {
        function frameOf(): {
            frame: ToolCallFrame; 
            saved: string[]; 
            ctx: ToolContext 
        } {
            const store = new Map<string, EffectResult>();
            const saved: string[] = [];
            const frame: ToolCallFrame = {
                runId: 'r1',
                toolCallId: 'c1',
                toolName: 'decide',
                stepIndex: 0,
                approvals: 0,
                effects: {
                    findOne: async (key) => store.get(key),
                    save: async (key, result) => {
                        saved.push(key);
                        store.set(key, { result });

                        return { result };
                    },
                },
            };

            return {
                frame, 
                saved, 
                ctx: { run: { runId: 'r1' } } as ToolContext, 
            };
        }

        it('shares one computation between overlapping calls of one name, then the stored value', async () => {
            const {
                frame, 
                saved, 
                ctx, 
            } = frameOf();
            let runs = 0;
            const gate = Promise.withResolvers<void>();
            const fn = async () => {
                runs++;
                await gate.promise;

                return { verdict: `run ${runs}` };
            };
            const both = runToolCall(frame, () => Promise.all([once(ctx, 'v', fn), once(ctx, 'v', fn)]));

            gate.resolve();

            const [first, second] = await both;

            expect(runs).toBe(1);
            expect(first).toEqual({ verdict: 'run 1' });
            expect(second).toEqual(first);
            expect(saved).toHaveLength(1);
            expect(await runToolCall(frame, () => once(ctx, 'v', fn))).toEqual({ verdict: 'run 1' });
            expect(runs).toBe(1);
        });

        it('leaves nothing shared after a rejection: the next call runs fn again', async () => {
            const {
                frame, 
                saved, 
                ctx, 
            } = frameOf();
            let runs = 0;
            const failing = async () => {
                runs++;

                throw new Error('boom');
            };

            await expect(runToolCall(frame, () => Promise.all([once(ctx, 'v', failing), once(ctx, 'v', failing)]))).rejects.toThrow('boom');
            expect(runs).toBe(1);
            expect(await runToolCall(frame, () => once(ctx, 'v', async () => 'ok'))).toBe('ok');
            expect(saved).toHaveLength(1);
        });

        it('saves nothing when the frame ended while fn ran', async () => {
            const {
                frame, 
                saved, 
                ctx, 
            } = frameOf();
            const result = runToolCall(frame, () => once(ctx, 'v', async () => {
                frame.abandoned = true;

                return 'late';
            }));

            await expect(result).rejects.toBeInstanceOf(InvalidRunStateError);
            expect(saved).toEqual([]);
        });
    });
});
