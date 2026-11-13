/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

// @vitest-environment happy-dom

import { Permission } from '@chamvi/access';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import { ApiError } from '@chamvi/ui-kit';
import type { AgentWire, IApiClient, RunWire } from '@chamvi/ui-kit';
import { RouteName } from '../../../../app/router/constants.ts';
import AgentView from '../../../../app/views/AgentView.vue';
import AgentsView from '../../../../app/views/AgentsView.vue';
import ApprovalsView from '../../../../app/views/ApprovalsView.vue';
import RunView from '../../../../app/views/RunView.vue';
import { fakeClient } from '../../../utils/client.ts';
import { wireRun } from '../../../utils/runs.ts';
import { mountView, settle } from '../../../utils/view.ts';

/** A 403 as `@chamvi/http` answers a missing permission. */
const refused = (permission: string) => new ApiError(403, 'FORBIDDEN', `Missing permission "${permission}".`);

const AGENT: AgentWire = {
    name: 'deploy',
    kind: 'model',
    channels: [{ channel: 'http', id: 'http' }],
    budget: { maxSteps: 20 },
    state: [],
    private: false,
};

const EMPTY_PAGE = {
    data: [],
    meta: {
        total: 0,
        limit: 100,
        offset: 0,
    },
};

const WAITING: RunWire = wireRun({
    id: 'r1',
    agent: 'deploy',
    status: 'waiting',
    waiting: {
        kind: 'approval',
        id: 'call-1:0',
        approvalId: 'call-1:0',
        toolName: 'deploy',
        toolCallId: 'call-1',
        title: 'Deploy prod?',
        expiresAt: '2999-01-01T00:00:00.000Z',
    },
});

const rejections: unknown[] = [];
const onRejection = (event: { reason?: unknown }) => {
    rejections.push(event.reason);
};

beforeEach(() => {
    rejections.length = 0;
    process.on('unhandledRejection', onRejection);
});

let unmount: (() => void) | undefined;

afterEach(async () => {
    unmount?.();
    unmount = undefined;
    await settle();
    process.off('unhandledRejection', onRejection);
    expect(rejections).toEqual([]);
});

function agentClient(agent: AgentWire, overrides: Partial<IApiClient> = {}): IApiClient {
    return fakeClient({
        listAgents: async () => ({ data: [agent], issues: [] }),
        listSchedules: async () => [],
        listRuns: async () => EMPTY_PAGE,
        listKv: async () => [],
        listDocs: async () => [],
        ...overrides,
    });
}

async function openAgent(names: readonly string[], client: IApiClient = agentClient(AGENT)) {
    const view = await mountView(AgentView, {
        path: `/agents/${AGENT.name}`,
        pattern: '/agents/:name',
        name: RouteName.AGENT,
        client,
        names,
    });

    unmount = view.unmount;

    return view;
}

const button = (root: ParentNode, text: string) => Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
    .find((element) => element.textContent?.trim().endsWith(text));

describe('the agent page: start run', () => {
    it('offers Start run when the session is allowed chamvi_agent_run', async () => {
        const { root } = await openAgent([Permission.AGENT_RUN]);

        expect(button(root, 'Start run')).toBeDefined();
    });

    it('offers no Start run without chamvi_agent_run', async () => {
        const { root } = await openAgent([Permission.RUN_READ, Permission.AGENT_READ]);

        expect(root.querySelector('h1')?.textContent).toContain('deploy');
        expect(button(root, 'Start run')).toBeUndefined();
    });

    it('offers no Start run for an agent without an http subscription, whatever is allowed', async () => {
        const { root } = await openAgent([Permission.AGENT_RUN], agentClient({ ...AGENT, channels: [] }));

        expect(button(root, 'Start run')).toBeUndefined();
    });

    it('names chamvi_agent_run inline when the API refuses the start (403)', async () => {
        const { root } = await openAgent([Permission.AGENT_RUN], agentClient(AGENT, {
            startRun: async () => {
                throw refused(Permission.AGENT_RUN);
            },
        }));

        button(root, 'Start run')?.click();
        await settle();

        const form = document.querySelector('form');

        form?.dispatchEvent(new Event('submit', { cancelable: true }));
        await settle(50);

        const alert = document.querySelector('[role="alert"]');

        expect(alert?.textContent).toContain('needs chamvi_agent_run for deploy');
    });
});

describe('the agents overview: private agents', () => {
    async function openAgents(names: readonly string[]) {
        const view = await mountView(AgentsView, {
            path: '/agents',
            pattern: '/agents',
            name: RouteName.AGENTS,
            client: agentClient({ ...AGENT, private: true }),
            names,
        });

        unmount = view.unmount;

        return view;
    }

    it('says why a private agent\'s runs are hidden without chamvi_agent_read', async () => {
        const { root } = await openAgents([Permission.RUN_READ]);

        expect(root.textContent).toContain('needs chamvi_agent_read for deploy');
    });

    it('says nothing when the session is allowed chamvi_agent_read', async () => {
        const { root } = await openAgents([Permission.RUN_READ, Permission.AGENT_READ]);

        expect(root.textContent).not.toContain('needs chamvi_agent_read');
    });
});

describe('the run page: cancel', () => {
    async function openRun(names: readonly string[], overrides: Partial<IApiClient> = {}) {
        const view = await mountView(RunView, {
            path: '/runs/r1',
            pattern: '/runs/:id',
            name: RouteName.RUN,
            client: fakeClient({
                getRun: async () => ({ ...wireRun({ id: 'r1', status: 'running' }), steps: [] }),
                streamRun: () => new Promise<Response>(() => {}),
                listAgents: async () => ({ data: [AGENT], issues: [] }),
                listRuns: async () => EMPTY_PAGE,
                ...overrides,
            }),
            names,
        });

        unmount = view.unmount;

        return view;
    }

    it('offers Cancel run when the session is allowed chamvi_run_cancel', async () => {
        const { root } = await openRun([Permission.RUN_CANCEL]);

        expect(button(root, 'Cancel run')).toBeDefined();
    });

    it('offers no Cancel run without chamvi_run_cancel', async () => {
        const { root } = await openRun([Permission.RUN_READ]);

        expect(root.querySelector('h1')?.textContent).toContain('Run');
        expect(button(root, 'Cancel run')).toBeUndefined();
    });

    it('names chamvi_run_cancel inline when the API refuses the cancel (403)', async () => {
        const {
            root, 
            confirm, 
            testId, 
        } = await openRun([Permission.RUN_CANCEL], {
            cancelRun: async () => {
                throw refused(Permission.RUN_CANCEL);
            },
        });

        button(root, 'Cancel run')?.click();
        await settle();
        confirm(true);
        await settle();

        expect(testId('cancel-error')?.textContent).toContain('needs chamvi_run_cancel for deploy');
    });

    it('drops a refusal that arrives after the page moved on to another run', async () => {
        let refuse: (() => void) | undefined;
        const {
            root,
            router,
            confirm,
            testId,
        } = await openRun([Permission.RUN_CANCEL], {
            getRun: async (id: string) => ({ ...wireRun({ id, status: 'running' }), steps: [] }),
            cancelRun: () => new Promise((_resolve, reject) => {
                refuse = () => reject(refused(Permission.RUN_CANCEL));
            }),
        });

        button(root, 'Cancel run')?.click();
        await settle();
        confirm(true);
        await settle();

        await router.push('/runs/r2');
        await settle();
        refuse?.();
        await settle();

        expect(testId('cancel-error')).toBeNull();
    });
});

describe('the approvals inbox: approve and deny', () => {
    async function openInbox(names: readonly string[], overrides: Partial<IApiClient> = {}) {
        const view = await mountView(ApprovalsView, {
            path: '/approvals',
            pattern: '/approvals',
            name: RouteName.APPROVALS,
            client: fakeClient({
                listRuns: async () => ({ ...EMPTY_PAGE, data: [WAITING] }),
                listArtifacts: async () => [],
                ...overrides,
            }),
            names,
        });

        unmount = view.unmount;

        return view;
    }

    it('offers approve and deny when the session is allowed chamvi_agent_approve', async () => {
        const { testId } = await openInbox([Permission.RUN_READ, Permission.AGENT_APPROVE]);

        expect(testId('approve')).not.toBeNull();
        expect(testId('deny')).not.toBeNull();
    });

    it('offers neither without chamvi_agent_approve and names it', async () => {
        const { testId } = await openInbox([Permission.RUN_READ]);

        expect(testId('approval')).not.toBeNull();
        expect(testId('approve')).toBeNull();
        expect(testId('deny')).toBeNull();
        expect(testId('approval')?.textContent).toContain('needs chamvi_agent_approve for deploy');
    });

    it.each(['approve', 'deny'])('names chamvi_agent_approve inline when the API refuses to %s (403)', async (action) => {
        const { testId } = await openInbox([Permission.RUN_READ, Permission.AGENT_APPROVE], {
            approve: async () => {
                throw refused(Permission.AGENT_APPROVE);
            },
        });

        testId(action)?.click();
        await settle();

        expect(testId('decided')?.textContent).toContain('needs chamvi_agent_approve for deploy');
    });
});
