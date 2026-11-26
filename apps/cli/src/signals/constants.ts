/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/**
 * A stop signal this soon after the first one is the same Ctrl-C delivered
 * twice (npm forwards SIGINT to the script and the terminal signals the whole
 * foreground group), not a request to force the exit.
 */
export const SIGNAL_REPEAT_MS = 1_000;
