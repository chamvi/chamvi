/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { CommandName } from 'just-bash';

export const FILES_MAX_BYTES = 5_242_880;
export const FILES_MAX_FILES = 16;
export const FILES_TIMEOUT_MS = 30_000;

export const FILES_MAX_COMMAND_BYTES = 16_384;
export const FILES_MAX_DIAGNOSTIC_BYTES = 65_536;
export const FILES_FILESYSTEM_OVERHEAD_BYTES = 65_536;
export const FILES_COMMANDS: CommandName[] = [
    'awk',
    'base64',
    'basename',
    'cat',
    'column',
    'comm',
    'cp',
    'cut',
    'diff',
    'dirname',
    'echo',
    'env',
    'expand',
    'find',
    'fold',
    'grep',
    'head',
    'help',
    'join',
    'jq',
    'ls',
    'mkdir',
    'mv',
    'nl',
    'paste',
    'printf',
    'pwd',
    'rev',
    'rg',
    'rm',
    'rmdir',
    'sed',
    'seq',
    'sort',
    'split',
    'tail',
    'tee',
    'touch',
    'tr',
    'uniq',
    'wc',
    'xan',
    'xargs',
    'yq',
];
