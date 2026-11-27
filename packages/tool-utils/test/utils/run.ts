/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ToolSet } from 'ai';
import {
    AgentRevisionService,
    ArtifactService,
    CheckpointService,
    EffectService,
    Engine,
    IdempotencyService,
    LockService,
    RunService,
    StateService,
    StepService,
    defineModelAgent,
    systemClock,
} from '@chamvi/core';
import type { DispatchEnvelope } from '@chamvi/core';
import type { DispatchParent, TriggerParent } from '@chamvi/core-kit';
import {
    MemoryAgentRevisionRepository,
    MemoryArtifactRepository,
    MemoryCheckpointRepository,
    MemoryEffectRepository,
    MemoryIdempotencyRepository,
    MemoryLockRepository,
    MemoryRegistry,
    MemoryRunRepository,
    MemoryStateDocumentRepository,
    MemoryStateRepository,
    MemoryStepRepository,
} from '@chamvi/store-memory';
import type { ControllableClock } from '@chamvi/test-kit';
import { mockModel } from '@chamvi/test-kit';

export type RunToolOptions = {
    clock?: ControllableClock;
    trigger?: Partial<DispatchEnvelope>;
    /** Lineage only the dispatch host can set: dispatched through a test subclass. */
    parent?: Omit<DispatchParent, 'runId'>;
};

class LineageEngine extends Engine {
    public dispatchWithParent(envelope: DispatchEnvelope, parent: TriggerParent) {
        return this.createRun(envelope, parent);
    }
}

/**
 * Drives a real Engine on a memory store: the model calls `name` once with
 * `input`. Returns the tool's output, or throws an Error with its error text.
 */
export async function runTool(tools: ToolSet, name: string, input: unknown, options: RunToolOptions = {}): Promise<unknown> {
    const agent = defineModelAgent({
        name: 'utility-test',
        model: mockModel([
            {
                parts: [{
                    type: 'tool-call',
                    toolName: name,
                    input,
                    toolCallId: 'c1',
                }],
            },
            { parts: [{ type: 'text', text: 'done' }] },
        ]),
        instructions: 'Call the tool.',
        tools,
    });
    const registry = new MemoryRegistry();
    const runs = new MemoryRunRepository({ registry });
    const locks = new MemoryLockRepository({ registry });
    const clock = options.clock ?? systemClock;
    const engine = new LineageEngine({
        runService: new RunService({ repository: runs, clock }),
        stepService: new StepService({ repository: new MemoryStepRepository({ registry }) }),
        checkpointService: new CheckpointService({ repository: new MemoryCheckpointRepository({ registry }) }),
        effectService: new EffectService({ repository: new MemoryEffectRepository({ registry }) }),
        agentRevisionService: new AgentRevisionService({ repository: new MemoryAgentRevisionRepository({ registry }) }),
        artifactService: new ArtifactService({ repository: new MemoryArtifactRepository({ registry }) }),
        stateService: new StateService({
            repository: new MemoryStateRepository({ registry }),
            documentRepository: new MemoryStateDocumentRepository({ registry }),
        }),
        lockService: new LockService({ repository: locks, clock: systemClock }),
        idempotencyService: new IdempotencyService({ repository: new MemoryIdempotencyRepository({ registry }), clock: systemClock }),
        agents: [agent],
        ...(options.clock ? { clock: options.clock } : {}),
    });

    // a parent run must exist; it is cancelled before the engine starts, so it never calls the model
    const parentRun = options.parent ?
        await engine.dispatch({
            agent: agent.name,
            trigger: 'test',
            channel: 'test',
            payload: {},
        }) :
        undefined;

    if (parentRun) {
        await engine.cancel(parentRun.runId);
    }

    await engine.start();

    const envelope: DispatchEnvelope = {
        agent: agent.name,
        trigger: 'test',
        channel: 'test',
        payload: {},
        ...options.trigger,
    };
    const { runId } = options.parent ?
        await engine.dispatchWithParent(envelope, { ...options.parent, runId: parentRun!.runId }) :
        await engine.dispatch(envelope);

    await engine.idle();

    const steps = await engine.stepService.find(runId);
    const step = steps.find((s) => s.kind === 'tool' && s.name === name);

    engine.stop();

    if (!step) {
        throw new Error(`The tool ${name} was not called.`);
    }

    if (step.error) {
        throw new Error((step.error as { message?: string }).message ?? String(step.error));
    }

    return step.output;
}
