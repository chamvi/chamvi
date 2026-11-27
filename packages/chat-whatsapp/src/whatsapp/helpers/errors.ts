/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError, ErrorCode } from '@chamvi/errors';
import { InvalidRunStateError } from '@chamvi/core';
import { isObject } from 'smob';

export function failure(code: string, message: string, cause?: unknown): ChamviError {
    return new ChamviError({
        code,
        message,
        ...(cause !== undefined ? { cause } : {}),
    });
}

/** The status code of a close (a Boom's `output.statusCode`), if any. */
export function statusCodeOf(error: unknown): number | undefined {
    if (isObject(error) && isObject(error.output) && typeof error.output.statusCode === 'number') {
        return error.output.statusCode;
    }

    return undefined;
}

/** Whether an acquire failure says another holder has the session (the vault's ConnectionHeldError, by code). */
export function isHeld(error: unknown): boolean {
    return isObject(error) && error.code === ErrorCode.CONNECTION_HELD;
}

/** The refusal of a reset the provider cannot perform: it would hand the old session back. */
export function resetUnsupported(): InvalidRunStateError {
    return new InvalidRunStateError('The WhatsApp auth provider does not support a reset (no supportsReset); the session was not reset.');
}

/** The refusal of a reset while another process holds the session: nothing is cleared, nothing queued. */
export function heldElsewhere(): InvalidRunStateError {
    return new InvalidRunStateError('The WhatsApp session is held by another process; the reset is refused and nothing is cleared. Retry once this process holds the session.');
}
