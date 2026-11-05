/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError } from '@chamvi/core';
import { MAIL_REQUEST_ERROR_CODE } from '../errors/constants.ts';

/**
 * A failed request as a tool error (code `mail_request`): `<tool>: <account>: <reason>`, the reason one of a
 * fixed set. Never the server's text, which may quote content or credentials.
 */
export function requestError(tool: string, account: string, reason: string): ChamviError {
    return new ChamviError({ message: `${tool}: ${account}: ${reason}`, code: MAIL_REQUEST_ERROR_CODE });
}
