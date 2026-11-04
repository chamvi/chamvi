/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { defineContextKey } from '../context/module.ts';
import type { DispatchHost } from './types.ts';

/** The role of `agent.on()` without one (and of `dispatch()` without one). */
export const DEFAULT_DISPATCH_ROLE = 'default';

/** The depth a role accepts unless `agent.on({ maxDepth })` says otherwise: a dispatched run cannot dispatch again. */
export const DEFAULT_DISPATCH_MAX_DEPTH = 1;

/** The highest `agent.on({ maxDepth })`: the engine's cap on dispatch trees. */
export const DISPATCH_DEPTH_MAX = 8;

/** The dispatches of one role a run may start unless `agent.on({ maxPerRun })` says otherwise. */
export const DEFAULT_MAX_DISPATCHES_PER_RUN = 100;

/** How long a run waits on its dispatched runs unless the wait gives a timeout (24 h). */
export const DEFAULT_DISPATCH_WAIT_TIMEOUT_MS = 86_400_000;

/** The engine's dispatch host (internal, kept out of the barrel). */
export const DISPATCH_CONTEXT = defineContextKey<DispatchHost>('dispatch');

/** Marks a dispatchTools() placeholder; its value is the DispatchToolTarget (internal, kept out of the barrel). */
export const DISPATCH_TOOL: unique symbol = Symbol.for('chamvi.dispatch-tool');

/** The longest generated dispatch tool name (the provider limit, as MCP's). */
export const DISPATCH_TOOL_NAME_MAX_LENGTH = 64;

/** Keywords whose values are data, not subschemas: a `$ref` key inside them is no reference (internal, kept out of the barrel). */
export const JSON_SCHEMA_DATA_KEYWORDS: ReadonlySet<string> = new Set(['const', 'default', 'enum', 'examples']);
