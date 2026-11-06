/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** Length in bytes of every master and data key (AES-256). */
export const KEYRING_KEY_LENGTH = 32;

/** Length in bytes of the random GCM nonce that leads sealed bytes. */
export const SEAL_IV_LENGTH = 12;

/** Length in bytes of the GCM authentication tag that ends sealed bytes. */
export const SEAL_TAG_LENGTH = 16;
