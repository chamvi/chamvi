/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/**
 * The field a conversation item query sorts by for the order items were
 * stored in (the transcript's order): the sequence every item repository
 * assigns when it stores a row, which reads return. Never the `id`: two
 * uuid v7 ids of one millisecond need not order as their rows were stored.
 */
export const CONVERSATION_ITEM_STORED_ORDER = 'sequence';
