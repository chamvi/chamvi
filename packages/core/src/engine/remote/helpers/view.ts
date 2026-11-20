/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';
import { RunStatus } from '@chamvi/store';
import type { RemoteApproval, Usage } from '@chamvi/store';
import { ValidationError } from '../../../errors/index.ts';
import type { PeerRunView } from '../../../peer/types.ts';
import { REMOTE_ERROR_CODE_MAX_LENGTH, REMOTE_ERROR_MESSAGE_MAX_LENGTH } from '../constants.ts';
import type { RemoteOutcome } from '../types.ts';

/**
 * The approval a peer's view shows pending (undefined without one), copied
 * field by field; a ValidationError for one that is not a remote approval
 * (non-empty `runId`, `approvalId`, `title`; `url` an http(s) URL).
 */
export function readRemoteViewApproval(view: PeerRunView): Omit<RemoteApproval, 'notifiedAt'> | undefined {
    const { approval } = view;

    if (approval === undefined) {
        return undefined;
    }

    const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

    if (
        !isObject(approval) ||
        !isText(approval.runId) ||
        !isText(approval.approvalId) ||
        !isText(approval.title) ||
        (approval.url !== undefined && (!isText(approval.url) || !/^https?:\/\//.test(approval.url) || !URL.canParse(approval.url)))
    ) {
        throw new ValidationError('The peer reported a malformed pending approval.');
    }

    return {
        runId: approval.runId,
        approvalId: approval.approvalId,
        title: approval.title,
        ...(approval.url !== undefined ? { url: approval.url } : {}),
    };
}

function isTokenCount(value: unknown): value is number {
    return Number.isSafeInteger(value) && (value as number) >= 0;
}

/** The usage a peer's view reports (zero without one); a ValidationError for a count that is not a non-negative integer. */
function readRemoteViewUsage(usage: unknown): Usage {
    if (usage === undefined) {
        return { inputTokens: 0, outputTokens: 0 };
    }

    if (!isObject(usage)) {
        throw new ValidationError('The peer reported a malformed usage.');
    }

    const inputTokens = usage.inputTokens === undefined ? 0 : usage.inputTokens;
    const outputTokens = usage.outputTokens === undefined ? 0 : usage.outputTokens;

    // a negative or non-numeric count would lower the subtree usage the caller's budgets sum
    if (!isTokenCount(inputTokens) || !isTokenCount(outputTokens)) {
        throw new ValidationError('The peer reported a malformed usage.');
    }

    return { inputTokens, outputTokens };
}

/** The error a peer's view reports, its code and message cut; a ValidationError for one without a string code and message. */
function readRemoteViewError(error: unknown): { code: string; message: string } {
    if (!isObject(error) || typeof error.code !== 'string' || typeof error.message !== 'string') {
        throw new ValidationError('The peer reported a malformed error.');
    }

    const message = error.message.length > REMOTE_ERROR_MESSAGE_MAX_LENGTH ?
        `${error.message.slice(0, REMOTE_ERROR_MESSAGE_MAX_LENGTH).toWellFormed()}…` :
        error.message;

    return { code: error.code.slice(0, REMOTE_ERROR_CODE_MAX_LENGTH).toWellFormed(), message };
}

/**
 * The outcome a settled remote run's view records; undefined while the
 * remote run has not settled. A ValidationError for a malformed usage or
 * error: the view comes from another app, maybe an untrusted one.
 */
export function remoteOutcomeOf(view: PeerRunView): RemoteOutcome | undefined {
    if (view.status !== RunStatus.COMPLETED && view.status !== RunStatus.FAILED && view.status !== RunStatus.CANCELLED) {
        return undefined;
    }

    const usage = readRemoteViewUsage(view.usage);
    const error = view.error !== undefined && view.error !== null ? readRemoteViewError(view.error) : undefined;

    return {
        status: view.status,
        ...(view.status === RunStatus.COMPLETED && view.output !== undefined ? { output: view.output } : {}),
        ...(error ? { error } : {}),
        tainted: view.tainted === true,
        usage,
    };
}
