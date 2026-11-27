/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ErrorCode, ValidationError } from '@chamvi/errors';
import { buildIssuesForStandardSchemaIssues } from '@validup/standard-schema';
import { RunStatus } from '@chamvi/core-kit';
import type { Usage } from '@chamvi/core-kit';
import { InvalidRunStateError, TimeoutError } from '../../../errors/index.ts';
import { describeIssues } from '../../../state/helpers.ts';
import { readRemoteStartRecord, remoteStartKey } from '../../remote/helpers/index.ts';
import type { RemoteOutcome } from '../../remote/types.ts';
import { toRunError } from '../helpers/index.ts';
import type { RemoteExecuteContext } from '../types.ts';

function addRemoteUsage(a: Usage, b: Usage): Usage {
    return { inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens };
}

/** `output` parsed by the agent's output schema; a ValidationError when it does not match. */
async function validateRemoteOutput(ctx: RemoteExecuteContext, output: unknown): Promise<unknown> {
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
export async function settleRemoteRun(ctx: RemoteExecuteContext, outcome: RemoteOutcome): Promise<void> {
    const {
        run,
        agent,
        clock,
    } = ctx;
    const { peer } = agent.definition;
    const usage = addRemoteUsage(run.usage, outcome.usage);

    if (outcome.status === 'timeout') {
        await ctx.finish({
            status: RunStatus.FAILED,
            error: toRunError(new TimeoutError(agent.definition.timeoutMs, `The remote run did not settle within ${agent.definition.timeoutMs}ms.`)),
            usage,
        });

        return;
    }

    if (!run.taint && (outcome.tainted || ctx.peers.settings(peer).untrusted)) {
        const started = readRemoteStartRecord((await ctx.effectService.findOne(remoteStartKey(run.id)))?.result);

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
        output = await validateRemoteOutput(ctx, outcome.output);
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
