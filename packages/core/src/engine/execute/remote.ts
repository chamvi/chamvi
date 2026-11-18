/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { buildIssuesForStandardSchemaIssues } from '@validup/standard-schema';
import { RunStatus } from '@chamvi/store';
import type { Run, Usage } from '@chamvi/store';
import type { ArtifactInput } from '../../artifact/types.ts';
import {
    ArtifactNotFoundError,
    ErrorCode,
    InvalidRunStateError,
    TimeoutError,
    ValidationError,
} from '../../errors/index.ts';
import type { PeerStartInput } from '../../peer/types.ts';
import { describeIssues } from '../../state/helpers.ts';
import {
    peerRequest,
    readOutcome,
    readStartRecord,
    remoteStartKey,
    remoteWaitKey,
} from '../remote/helpers.ts';
import type { RemoteOutcome } from '../remote/types.ts';
import { toRunError } from './helpers.ts';
import type { RemoteExecuteContext } from './types.ts';

function addUsage(a: Usage, b: Usage): Usage {
    return { inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens };
}

/**
 * The calling run the peer counts the start against: the stand-in's parent
 * when it was dispatched here, else the stand-in itself. `depth` is the
 * stand-in's own depth.
 */
function callerOf(run: Run): PeerStartInput['peer']['parent'] {
    const { parent } = run.trigger;

    if (parent?.kind === 'dispatch') {
        return {
            runId: parent.runId,
            agent: parent.agent,
            depth: parent.depth,
        };
    }

    return {
        runId: run.id,
        agent: run.agent,
        depth: parent?.depth ?? 0,
    };
}

/** The stand-in's attachments with their bytes, in the dispatch order. */
async function attachmentsOf(ctx: RemoteExecuteContext): Promise<ArtifactInput[] | undefined> {
    const { attachments } = ctx.run.trigger;

    if (!attachments || attachments.length === 0) {
        return undefined;
    }

    return Promise.all(attachments.map(async (artifact) => {
        const data = await ctx.artifactService.read(artifact.id);

        if (!data) {
            throw new ArtifactNotFoundError(artifact.id);
        }

        return {
            mediaType: artifact.mediaType,
            ...(artifact.filename !== undefined ? { filename: artifact.filename } : {}),
            data,
        };
    }));
}

async function startInput(ctx: RemoteExecuteContext): Promise<PeerStartInput> {
    const { run, agent } = ctx;
    const attachments = await attachmentsOf(ctx);
    const origin = run.trigger.invoker?.name;

    return {
        agent: agent.definition.agent,
        role: agent.definition.role,
        payload: run.trigger.payload,
        ...(attachments ? { attachments } : {}),
        // the local run id: every resend of this start reaches the same remote run
        idempotencyKey: run.id,
        peer: {
            standIn: run.id,
            parent: callerOf(run),
            taint: run.taint !== undefined,
            ...(origin !== undefined ? { origin } : {}),
        },
    };
}

/**
 * The start effect `remote-start:<runId>`: the recorded remote run id, else
 * the start's answer, recorded. Undefined when the execution ended without
 * one: settled (cancelled, or failed with a start ValidationError), or left
 * `running` for recovery after a retryable rejection.
 */
async function startRemote(ctx: RemoteExecuteContext): Promise<string | undefined> {
    const {
        run,
        agent,
        effectService,
        clock,
    } = ctx;
    const { peer, timeoutMs } = agent.definition;
    const key = remoteStartKey(run.id);
    const recorded = readStartRecord((await effectService.findOne(key))?.result);

    if (recorded) {
        return recorded.runId;
    }

    // retries end at the remote deadline: a start that never got through fails like a remote run that never settled
    if (clock.now() >= run.createdAt.getTime() + timeoutMs) {
        await ctx.finish({
            status: RunStatus.FAILED,
            error: toRunError(new TimeoutError(timeoutMs, `The remote run of agent "${agent.name}" was not started within ${timeoutMs}ms.`)),
        });

        return undefined;
    }

    let remoteRunId: string;

    try {
        const input = await startInput(ctx);
        const answer = await peerRequest(
            clock,
            ctx.signal,
            (signal) => ctx.peers.transport(peer).start(input, { signal }),
        );

        if (typeof answer?.runId !== 'string' || answer.runId.length === 0) {
            // a broken peer: a resend gets the same answer
            throw new ValidationError(`Peer "${peer}" answered the start of run "${run.id}" without a run id.`);
        }

        remoteRunId = answer.runId;
    } catch (error) {
        if (ctx.signal.aborted) {
            await ctx.finish({ status: RunStatus.CANCELLED });

            return undefined;
        }

        if (error instanceof ValidationError || error instanceof ArtifactNotFoundError) {
            await ctx.finish({ status: RunStatus.FAILED, error: toRunError(error) });

            return undefined;
        }

        // the remote may have created the run: the claim expires, recovery resends under the same key
        ctx.onError(error, run);

        return undefined;
    }

    try {
        await effectService.save(key, { runId: remoteRunId, peer });
    } catch (error) {
        // the start is idempotent under its key: recovery resends it and reaches the same remote run
        ctx.onError(error, run);

        return undefined;
    }

    return remoteRunId;
}

/** `output` parsed by the agent's output schema; a ValidationError when it does not match. */
async function validateOutput(ctx: RemoteExecuteContext, output: unknown): Promise<unknown> {
    const schema = ctx.agent.definition.output;

    if (!schema) {
        return output;
    }

    const result = await schema['~standard'].validate(output);

    if (result.issues) {
        const issues = buildIssuesForStandardSchemaIssues(result.issues);

        throw new ValidationError(`Invalid output of remote agent "${ctx.agent.name}": ${describeIssues(issues)}`, issues);
    }

    return result.value;
}

/**
 * Settles the stand-in from its recorded remote outcome. A result from a
 * tainted remote run or an untrusted peer taints the run first (kept when it
 * is tainted already), before any output or error is stored.
 */
async function settle(ctx: RemoteExecuteContext, outcome: RemoteOutcome): Promise<void> {
    const {
        run,
        agent,
        clock,
    } = ctx;
    const { peer } = agent.definition;
    const usage = addUsage(run.usage, outcome.usage);

    if (outcome.status === 'timeout') {
        await ctx.finish({
            status: RunStatus.FAILED,
            error: toRunError(new TimeoutError(agent.definition.timeoutMs, `The remote run did not settle within ${agent.definition.timeoutMs}ms.`)),
            usage,
        });

        return;
    }

    if (!run.taint && (outcome.tainted || ctx.peers.settings(peer).untrusted)) {
        const started = readStartRecord((await ctx.effectService.findOne(remoteStartKey(run.id)))?.result);

        if (!started) {
            // `peer:<peer>` is the intake source: a result is never attributed to it
            throw new InvalidRunStateError(`Run "${run.id}" has no recorded remote start; its remote result cannot be attributed.`);
        }

        await ctx.update({ taint: { at: new Date(clock.now()), source: `peer:${peer}/${started.runId}` } });
    }

    if (outcome.status === 'cancelled') {
        await ctx.finish({
            status: RunStatus.CANCELLED,
            ...(outcome.error ? { error: outcome.error } : {}),
            usage,
        });

        return;
    }

    if (outcome.status === 'failed') {
        await ctx.finish({
            status: RunStatus.FAILED,
            error: outcome.error ?? { code: ErrorCode.REMOTE_FAILED, message: `The remote run of agent "${agent.name}" failed.` },
            usage,
        });

        return;
    }

    let output: unknown;

    try {
        output = await validateOutput(ctx, outcome.output);
    } catch (error) {
        await ctx.finish({
            status: RunStatus.FAILED,
            error: toRunError(error),
            usage,
        });

        return;
    }

    await ctx.finish({
        status: RunStatus.COMPLETED,
        ...(output !== undefined ? { output } : {}),
        usage,
    });
}

/**
 * One execution of a claimed, `running` stand-in run of a remote agent. No
 * model call and no step of its own: with a recorded outcome
 * (`remote-wait:<runId>`) it settles the run; else it starts the remote run
 * through the start effect (`remote-start:<runId>`, the local run id as the
 * idempotency key, so a resend after a lost answer reaches the same remote
 * run, and a recorded start is never sent again) and pauses on a `remote`
 * wait point that expires after the agent's `timeoutMs`. A start rejected
 * with a ValidationError fails the run; any other rejection, and a store
 * failure while recording the start or pausing, ends only the execution
 * (onError), and recovery retries once the claim expired, until the remote
 * deadline (`createdAt + timeoutMs`) passed: then the run fails with Timeout.
 */
export async function executeRemoteRun(ctx: RemoteExecuteContext): Promise<void> {
    const {
        run,
        agent,
        effectService,
    } = ctx;
    const outcome = readOutcome((await effectService.findOne(remoteWaitKey(run.id)))?.result);

    if (outcome) {
        await settle(ctx, outcome);

        return;
    }

    const remoteRunId = await startRemote(ctx);

    if (remoteRunId === undefined) {
        return;
    }

    try {
        await ctx.pause({
            kind: 'remote',
            id: 'remote',
            peer: agent.definition.peer,
            agent: agent.definition.agent,
            remoteRunId,
            timeoutMs: agent.definition.timeoutMs,
        }, { ...run.usage });
    } catch (error) {
        // the start is recorded: recovery re-pauses on the same remote run without sending it again
        ctx.onError(error, run);
    }
}
