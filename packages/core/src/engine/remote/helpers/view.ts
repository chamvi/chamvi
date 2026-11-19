/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';
import { RunStatus } from '@chamvi/store';
import type { RemoteApproval } from '@chamvi/store';
import { ValidationError } from '../../../errors/index.ts';
import type { PeerRunView } from '../../../peer/types.ts';
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

/** The outcome a settled remote run's view records; undefined while the remote run has not settled. */
export function remoteOutcomeOf(view: PeerRunView): RemoteOutcome | undefined {
    if (view.status !== RunStatus.COMPLETED && view.status !== RunStatus.FAILED && view.status !== RunStatus.CANCELLED) {
        return undefined;
    }

    return {
        status: view.status,
        ...(view.status === RunStatus.COMPLETED && view.output !== undefined ? { output: view.output } : {}),
        ...(view.error ? { error: { code: String(view.error.code), message: String(view.error.message) } } : {}),
        tainted: view.tainted === true,
        usage: {
            inputTokens: view.usage?.inputTokens ?? 0,
            outputTokens: view.usage?.outputTokens ?? 0,
        },
    };
}
