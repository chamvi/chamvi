/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { Permission } from '@chamvi/access';
import type { PermissionBinding } from '@chamvi/access';
import { requireToolPermission } from '@chamvi/core';
import type { Invoker, RunContext } from '@chamvi/core';

const NOW = new Date(2026, 10, 11, 10, 0);

const context = (invoker?: Invoker): { run: RunContext; now: Date } => ({
    run: {
        runId: 'r1',
        agent: 'release',
        trigger: {
            id: 't',
            agent: 'release',
            trigger: 'http',
            channel: 'http',
            payload: {},
            receivedAt: new Date(0),
            invoker,
        },
        signal: new AbortController().signal,
    },
    now: NOW,
});

const invoker = (...bindings: PermissionBinding[]): Invoker => ({
    id: 'u1',
    kind: 'user',
    bindings,
});

const deployOnly: PermissionBinding = {
    permission: { name: Permission.TOOL_USE },
    policies: [{ type: 'attributes', query: { agent: 'release', name: 'deploy' } } as never],
};

describe('requireToolPermission', () => {
    it('allows a tool its binding is restricted to', async () => {
        await expect(requireToolPermission()('deploy', context(invoker(deployOnly)))).resolves.toBe(true);
    });

    it('denies another tool and the same tool of another agent', async () => {
        const otherAgent: PermissionBinding = {
            permission: { name: Permission.TOOL_USE },
            policies: [{ type: 'attributes', query: { agent: 'other', name: 'deploy' } } as never],
        };

        await expect(requireToolPermission()('rollback', context(invoker(deployOnly)))).resolves.toBe(false);
        await expect(requireToolPermission()('deploy', context(invoker(otherAgent)))).resolves.toBe(false);
    });

    it('allows every tool with an unrestricted binding', async () => {
        const policy = requireToolPermission();

        await expect(policy('anything', context(invoker({ permission: { name: Permission.TOOL_USE } })))).resolves.toBe(true);
    });

    it('denies an invoker without a chamvi_tool_use binding', async () => {
        const policy = requireToolPermission();

        await expect(policy('deploy', context(invoker()))).resolves.toBe(false);
        await expect(policy('deploy', context(invoker({ permission: { name: Permission.AGENT_RUN } })))).resolves.toBe(false);
    });

    it('evaluates a time policy at the given now', async () => {
        const office: PermissionBinding = {
            permission: { name: Permission.TOOL_USE },
            policies: [{
                type: 'time', 
                start: '09:00', 
                end: '11:00', 
            } as never],
        };
        const policy = requireToolPermission();

        await expect(policy('deploy', context(invoker(office)))).resolves.toBe(true);
        await expect(policy('deploy', { ...context(invoker(office)), now: new Date(2026, 10, 11, 12, 0) })).resolves.toBe(false);
    });

    it('denies a stored invoker holding old string permissions without throwing', async () => {
        const stored = {
            id: 'u1', 
            kind: 'user', 
            bindings: ['tool:release:deploy', '*'], 
        } as unknown as Invoker;

        await expect(requireToolPermission()('deploy', context(stored))).resolves.toBe(false);
        await expect(requireToolPermission({ withoutInvoker: 'allow' })('deploy', context(stored))).resolves.toBe(false);
    });

    it('denies runs without an invoker by default', async () => {
        await expect(requireToolPermission()('deploy', context())).resolves.toBe(false);
        await expect(requireToolPermission({ withoutInvoker: 'deny' })('deploy', context())).resolves.toBe(false);
    });

    it('allows runs without an invoker on withoutInvoker allow', async () => {
        await expect(requireToolPermission({ withoutInvoker: 'allow' })('deploy', context())).resolves.toBe(true);
        // an invoker still has to hold the permission
        await expect(requireToolPermission({ withoutInvoker: 'allow' })('deploy', context(invoker()))).resolves.toBe(false);
    });
});
