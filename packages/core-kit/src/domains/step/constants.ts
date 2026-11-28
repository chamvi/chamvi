/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/**
 * The field a step query sorts by for the order steps were saved in: a
 * sequence every step repository assigns when it stores a row (not when
 * the entity object is created) and no read returns. Never the `id`: two
 * uuid v7 ids of one millisecond need not order as their rows were stored.
 */
export const STEP_STORED_ORDER = 'sequence';
