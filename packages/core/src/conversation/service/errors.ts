/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidRunStateError } from '../../errors/index.ts';

export function conversationStaleError(): InvalidRunStateError {
    return new InvalidRunStateError('The conversation scope is stale: it was reset or deleted.');
}

export function conversationOwnerError(): InvalidRunStateError {
    return new InvalidRunStateError('The run does not hold the conversation turn.');
}
