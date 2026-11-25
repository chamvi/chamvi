/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { tool } from 'ai';
import type { Tool, ToolExecuteFunction } from 'ai';
import { assertToolLimit } from '../limit/asserts.ts';
import type { ToolLimit } from '../limit/types.ts';
import type { StateSchema } from '../state/types.ts';
import { assertToolTrust } from '../trust/asserts.ts';
import { toolContextSchema } from './constants.ts';
import type { ToolContext, ToolTrust } from './types.ts';

/**
 * An AI SDK `tool()` whose `execute` receives the run's ToolContext
 * (`run`, `state`, `artifacts`) as `options.context`. Returns a plain `Tool`.
 * Throws InvalidAgentDefinitionError for a `trust` that is no object of
 * boolean or predicate `taint`/`guardWhenTainted` flags, and for an invalid
 * `limit` (the default rate limit the agent's `limits` entry replaces).
 */
export function defineTool<I, O, S extends StateSchema = StateSchema>(
    def: Tool<I, O, ToolContext<S>> & {
        execute: ToolExecuteFunction<I, O, ToolContext<S>>;
        contextSchema?: never;
        trust?: ToolTrust<I, S>;
        limit?: ToolLimit<I, S>;
    },
): Tool<I, O, ToolContext<S>> {
    assertToolTrust(def.trust);
    assertToolLimit(def.limit);

    // tool()'s overloads cannot see the generic S
    return tool({ ...def, contextSchema: toolContextSchema } as never) as Tool<I, O, ToolContext<S>>;
}
