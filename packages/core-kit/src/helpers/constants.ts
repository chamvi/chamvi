/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/**
 * Characters (as JSON) a validation issue's `received` value may have;
 * a larger one is dropped, so a 400 never echoes a large body back.
 */
export const RECEIVED_MAX_LENGTH = 256;

/** Padded base64 of the standard alphabet (RFC 4648 section 4), no whitespace. */
export const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
