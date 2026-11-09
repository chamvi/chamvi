/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** One server-sent event; `event` is `message` when the block names none. */
export type SseEvent = {
    event: string;
    data: string;
    id?: string
};
