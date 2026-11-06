/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError } from './base.ts';
import { ErrorCode } from './constants.ts';

/**
 * Sealed bytes did not open: a wrong key, a wrong context (AAD), a tampered
 * byte, or a data key wrapped under a master key the keyring does not hold
 * (`keyId` names it). The message never carries key material or plaintext.
 */
export class DecryptionFailedError extends ChamviError {
    readonly keyId?: string;

    constructor(keyId?: string) {
        super({
            message: keyId === undefined ?
                'Decryption failed: wrong key, wrong context or tampered data.' :
                `Decryption failed: the keyring holds no key "${keyId}".`,
            code: ErrorCode.DECRYPTION_FAILED,
        });

        if (keyId !== undefined) {
            this.keyId = keyId;
        }
    }
}
