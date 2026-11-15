/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { TRIGGER_KEY_MAX_LENGTH } from '@chamvi/core';

/**
 * Bounds of an `idempotencyKey`, an `address`, an `Idempotency-Key` header and
 * a webhook's derived keys: core's TRIGGER_KEY_MAX_LENGTH.
 */
export const KEY_MAX_LENGTH = TRIGGER_KEY_MAX_LENGTH;

/**
 * Characters (as JSON) a validation issue's `received` value may have;
 * a larger one is dropped, so a 400 never echoes a large body back.
 */
export const RECEIVED_MAX_LENGTH = 256;

