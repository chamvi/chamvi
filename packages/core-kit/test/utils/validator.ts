/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { expect } from 'vitest';
import { isValidupError } from 'validup';
import type { Container } from 'validup';

/*
 * A validator row: an input and either what the validator returns or the
 * issues (path, code, message, the bounded `received`, `meta`) it throws,
 * as the HTTP error body carries them.
 */

export type Row = {
    title: string;
    input: unknown;
    output?: unknown;
    issues?: unknown[];
};

export const NUL = 'a\0b';

/** `n` characters. */
export function chars(n: number): string {
    return 'a'.repeat(n);
}

export async function verify(validator: Container<any>, row: Row, group?: string): Promise<void> {
    const run = validator.run(row.input as Record<string, any>, group ? { group } : {});

    if (row.issues === undefined) {
        expect(await run).toEqual(row.output);

        return;
    }

    const error = await run.then(() => undefined, (error_: unknown) => error_);

    expect(isValidupError(error)).toBe(true);
    // through JSON, as the HTTP error body: an issue's undefined `received` is no key there
    expect(JSON.parse(JSON.stringify((error as { issues: unknown[] }).issues))).toEqual(row.issues);
}

/** `input` without `key`, as a JSON body that leaves it out. */
export function omit(input: Record<string, unknown>, key: string): Record<string, unknown> {
    return Object.fromEntries(Object.entries(input).filter(([entry]) => entry !== key));
}
