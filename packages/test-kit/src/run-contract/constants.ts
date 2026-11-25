/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */
import { RunStatus } from '@chamvi/store';
import type {
    ApprovalWaitPoint,
    DispatchWaitPoint,
    PeerParent,
    RemoteWaitPoint,
} from '@chamvi/store';
import { testUuid } from '../fixture/helpers.ts';

export const APPROVAL: ApprovalWaitPoint = {
    kind: 'approval',
    id: '0:c1:0',
    approvalId: '0:c1:0',
    toolName: 'deploy',
    toolCallId: 'c1',
    title: 'Deploy?',
    options: [{ id: 'yes', label: 'Yes' }],
    channel: 'console',
    expiresAt: new Date(5_000),
    notifiedAt: new Date(2_000),
};

export const DISPATCH: DispatchWaitPoint = {
    kind: 'dispatch',
    id: '1:c2:w0',
    toolName: 'review',
    toolCallId: 'c2',
    runIds: [testUuid('c1'), testUuid('c2')],
    expiresAt: new Date(9_000),
};

export const REMOTE: RemoteWaitPoint = {
    kind: 'remote',
    id: 'remote',
    peer: 'dev',
    agent: 'developer',
    remoteRunId: 'remote-run-1',
    expiresAt: new Date(9_000),
    wakeRequested: true,
    remote: {
        status: RunStatus.WAITING,
        approval: {
            runId: 'remote-run-2',
            approvalId: '0:c1:0',
            title: 'Deploy?',
            url: 'https://dev.example.com/approvals/remote-run-2/0:c1:0',
            notifiedAt: new Date(3_000),
        },
    },
};

export const PEER: PeerParent = {
    kind: 'peer',
    peer: 'dev',
    runId: 'caller-run-1',
    standIn: 'caller-run-2',
    agent: 'assistant',
    role: 'default',
    depth: 2,
    origin: 'Peter',
};
