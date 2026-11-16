/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** Server name the MCP endpoint reports by default. */
/** Where the MCP endpoint is mounted, relative to `basePath`. */
export const MCP_PATH = '/mcp';

export const DEFAULT_MCP_NAME = 'chamvi';

/** Server version the MCP endpoint reports by default. */
export const DEFAULT_MCP_VERSION = '0.0.0';

/** Longest `waitSeconds` a `run_<agent>` call waits; larger values are clamped. */
export const DEFAULT_MCP_MAX_WAIT_SECONDS = 60;

/** How often a waiting `run_<agent>` call polls the store. */
export const MCP_WAIT_POLL_MS = 1_000;

/** Longest tool name the MCP spec allows (`run_<agent>` included). */
export const MCP_TOOL_NAME_MAX_LENGTH = 64;
