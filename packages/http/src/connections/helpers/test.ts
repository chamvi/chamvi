/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError, ErrorCode } from '@chamvi/core';
import type { ConnectionTypeDefinition, ConnectionValues } from '@chamvi/core';
import { TEST_MESSAGE_MAX_LENGTH, TEST_TIMEOUT_MS } from '../constants.ts';
import type { ConnectionServiceContext } from '../types.ts';

/**
 * Runs a test within TEST_TIMEOUT_MS on the clock: the test's signal aborts,
 * and a test that ignores it still ends here.
 */
export async function runTest(
    ctx: ConnectionServiceContext,
    test: NonNullable<ConnectionTypeDefinition['test']>,
    values: ConnectionValues,
    outer: AbortSignal,
): Promise<void> {
    const controller = new AbortController();
    let timer: { clear(): void } | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
        timer = ctx.clock.setTimeout(() => {
            const error = new ChamviError({ message: 'The connection test timed out.', code: ErrorCode.TIMEOUT });

            controller.abort(error);
            reject(error);
        }, TEST_TIMEOUT_MS);
    });

    try {
        await Promise.race([test(values, AbortSignal.any([outer, controller.signal])), deadline]);
    } finally {
        timer?.clear();
    }
}

/** Every failure's message is shown to an operator: only ours, with the saved secrets removed. */
export function testFailureMessage(error: unknown, secrets: readonly string[]): string {
    if (!(error instanceof ChamviError)) {
        return 'The connection test failed.';
    }

    return secrets
        .filter((secret) => secret.length > 0)
        .reduce((message, secret) => message.replaceAll(secret, '[secret]'), error.message)
        .slice(0, TEST_MESSAGE_MAX_LENGTH);
}
