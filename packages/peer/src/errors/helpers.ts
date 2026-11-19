/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** `message` with every non-empty secret of `secrets` replaced, so no credential reaches an error or a log. */
export function redact(message: string, secrets: readonly string[]): string {
    let out = message;

    for (const secret of secrets) {
        if (secret.length > 0) {
            out = out.replaceAll(secret, '[redacted]');
        }
    }

    return out;
}

/**
 * The wait in ms a `Retry-After` value asks for: delay seconds, or an HTTP
 * date measured against `now` (a past date is 0). `undefined` for no value
 * or one that is neither.
 */
export function retryAfterMsOf(value: string | null | undefined, now: number): number | undefined {
    const text = value?.trim();

    if (!text) {
        return undefined;
    }

    if (/^\d+$/.test(text)) {
        return Number(text) * 1000;
    }

    const at = Date.parse(text);

    return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}
