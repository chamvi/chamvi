/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Permission, can } from '@chamvi/access';
import type { ToolPolicy } from '../agent/types.ts';
import type { RequireToolPermissionOptions } from './types.ts';

/**
 * A tool policy that offers a tool only when the run's invoker holds
 * `chamvi_tool_use` for `{ agent, name }` (the run's agent and the tool) at
 * the engine clock's time; a run without an invoker follows `withoutInvoker`
 * (default `'deny'`). Wrap it for exceptions.
 */
export function requireToolPermission(options: RequireToolPermissionOptions = {}): ToolPolicy {
    const withoutInvoker = options.withoutInvoker ?? 'deny';

    return async (toolName, { run, now }) => {
        const { invoker } = run.trigger;

        if (!invoker) {
            return withoutInvoker === 'allow';
        }

        return can(invoker, Permission.TOOL_USE, {
            attributes: { agent: run.agent, name: toolName },
            now,
        });
    };
}
