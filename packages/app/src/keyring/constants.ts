/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/**
 * The app's master keyring, `<id>:<base64 32 bytes>[,<id>:<base64>...]`, the
 * first key active: it wraps the data key of every connection.
 */
export const ENV_ENCRYPTION_KEYS = 'CHAMVI_ENCRYPTION_KEYS';
